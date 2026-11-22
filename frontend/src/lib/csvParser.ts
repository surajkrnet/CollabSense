import { CustomerTier, RawTicket, sanitizeFormulaInjection } from './calculators';

export interface CsvParseDiagnostics {
  tickets: RawTicket[];
  totalDataRows: number;
  skippedRows: number;
  skippedReasons: string[];
  detectedColumns: {
    id?: string;
    source?: string;
    customer_tier?: string;
    arr_weight?: string;
    content: string;
    created_at?: string;
  };
  delimiter: string;
  sanitizedCount: number;
  truncatedAtLimit: boolean;
}

const MAX_CSV_ROWS = 2000;

/** Detects the primary CSV/TSV delimiter on the first logical line outside quotes. */
function detectDelimiter(text: string): string {
  const candidates = [',', '\t', ';'] as const;
  const counts: Record<string, number> = { ',': 0, '\t': 0, ';': 0 };
  let inQuotes = false;
  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i];
    if (ch === '"') {
      if (inQuotes && text[i + 1] === '"') {
        i += 1;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (!inQuotes && (ch === '\n' || ch === '\r')) {
      break;
    } else if (!inQuotes && (ch === ',' || ch === '\t' || ch === ';')) {
      counts[ch] += 1;
    }
  }
  let best: string = ',';
  let bestCount = counts[','];
  for (const delim of candidates) {
    if (counts[delim] > bestCount) {
      best = delim;
      bestCount = counts[delim];
    }
  }
  return best;
}

/**
 * Full RFC-4180 CSV/TSV state-machine parser:
 * Preserves multi-line quoted cells ("\n" inside "..."), handles escaped "",
 * CRLF/LF/CR endings, and empty trailing lines without dropping rows.
 */
export function parseCsvMatrix(rawText: string, delimiter?: string): { rows: string[][]; delimiter: string } {
  const cleaned = rawText.replace(/^\uFEFF/, '');
  if (!cleaned.trim()) {
    return { rows: [], delimiter: ',' };
  }
  const delim = delimiter || detectDelimiter(cleaned);
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = '';
  let inQuotes = false;

  for (let i = 0; i < cleaned.length; i += 1) {
    const ch = cleaned[i];
    if (inQuotes) {
      if (ch === '"') {
        if (cleaned[i + 1] === '"') {
          cell += '"';
          i += 1;
        } else {
          inQuotes = false;
        }
      } else {
        cell += ch;
      }
    } else if (ch === '"') {
      inQuotes = true;
    } else if (ch === delim) {
      row.push(cell.trim());
      cell = '';
    } else if (ch === '\r') {
      if (cleaned[i + 1] === '\n') {
        i += 1;
      }
      row.push(cell.trim());
      cell = '';
      if (row.some((c) => c.length > 0)) {
        rows.push(row);
      }
      row = [];
    } else if (ch === '\n') {
      row.push(cell.trim());
      cell = '';
      if (row.some((c) => c.length > 0)) {
        rows.push(row);
      }
      row = [];
    } else {
      cell += ch;
    }
  }

  row.push(cell.trim());
  if (row.some((c) => c.length > 0)) {
    rows.push(row);
  }
  return { rows, delimiter: delim };
}

function normalizeHeader(h: string): string {
  return h.toLowerCase().replace(/[^a-z0-9_]+/g, '_').replace(/^_+|_+$/g, '');
}

function normalizeTier(raw: string): CustomerTier {
  const s = raw.toLowerCase().trim();
  if (!s) return 'Standard';
  if (s.includes('ent')) return 'Enterprise';
  if (s.includes('mid')) return 'Mid-Market';
  if (s.includes('pro') || s.includes('plus') || s.includes('team') || s.includes('growth')) return 'Pro';
  if (s.includes('free') || s.includes('trial') || s.includes('comm')) return 'Free';
  return 'Standard';
}

function normalizeSource(raw: string): string {
  const clean = raw.trim();
  if (!clean) return 'CSV';
  const low = clean.toLowerCase();
  if (low.includes('zendesk')) return 'Zendesk';
  if (low.includes('discord')) return 'Discord';
  if (low.includes('linear')) return 'Linear';
  if (low.includes('appstore') || low.includes('app store')) return 'AppStore';
  return clean.slice(0, 32);
}

function parseArrNumber(raw: string, isMrrCol: boolean): number {
  const s = raw.trim().toLowerCase().replace(/[$,\s]/g, '');
  if (!s) return 0;
  const kMatch = s.match(/^(-?\d+(?:\.\d+)?)k/);
  let num = kMatch ? Number(kMatch[1]) * 1000 : Number(s.replace(/[^0-9.\-]/g, ''));
  if (!Number.isFinite(num) || num <= 0) return 0;
  if (isMrrCol) num *= 12;
  return Math.round(num);
}

const ID_ALIASES = new Set(['id', 'ticket_id', 'ticket', 'key', 'ref', 'case_id', 'record_id', 'row_id', 'number', 'issue_id']);
const SRC_ALIASES = new Set(['source', 'channel', 'platform', 'origin', 'tool', 'medium', 'app', 'ticket_source']);
const TIER_ALIASES = new Set(['tier', 'customer_tier', 'plan', 'segment', 'account_tier', 'subscription', 'plan_tier', 'customer_segment']);
const ARR_ALIASES = new Set(['arr', 'arr_weight', 'mrr', 'revenue', 'acv', 'value', 'ltv', 'contract_value', 'annual_revenue']);
const DATE_ALIASES = new Set(['created_at', 'date', 'timestamp', 'created', 'time', 'submitted_at', 'reported_at']);
const SUBJECT_ALIASES = new Set(['subject', 'title', 'headline', 'topic', 'issue_title']);
const CONTENT_ALIASES = new Set([
  'content', 'feedback', 'message', 'description', 'text', 'body', 'issue', 'comment',
  'summary', 'review', 'complaint', 'notes', 'details', 'verbatim', 'quote', 'raw_text',
  'ticket_text', 'feedback_text', 'customer_feedback', 'user_feedback', 'message_body',
]);

export function parseCsvToTickets(rawText: string): CsvParseDiagnostics {
  const { rows, delimiter } = parseCsvMatrix(rawText);
  if (rows.length === 0) {
    return {
      tickets: [],
      totalDataRows: 0,
      skippedRows: 0,
      skippedReasons: [],
      detectedColumns: { content: 'auto' },
      delimiter,
      sanitizedCount: 0,
      truncatedAtLimit: false,
    };
  }

  const headerNorms = rows[0].map(normalizeHeader);
  const allKnown = new Set([
    ...ID_ALIASES,
    ...SRC_ALIASES,
    ...TIER_ALIASES,
    ...ARR_ALIASES,
    ...DATE_ALIASES,
    ...SUBJECT_ALIASES,
    ...CONTENT_ALIASES,
  ]);
  const hasHeader = rows.length > 1 && headerNorms.some((h) => allKnown.has(h));
  const headerLabels = hasHeader ? rows[0] : [];
  const allDataRows = hasHeader ? rows.slice(1) : rows;
  const truncatedAtLimit = allDataRows.length > MAX_CSV_ROWS;
  const dataRows = allDataRows.slice(0, MAX_CSV_ROWS);

  const findCol = (aliases: Set<string>): number =>
    hasHeader ? headerNorms.findIndex((h) => aliases.has(h)) : -1;

  const idIdx = findCol(ID_ALIASES);
  const srcIdx = findCol(SRC_ALIASES);
  const tierIdx = findCol(TIER_ALIASES);
  const arrIdx = findCol(ARR_ALIASES);
  const dateIdx = findCol(DATE_ALIASES);
  const subjectIdx = findCol(SUBJECT_ALIASES);
  let contentIdx = findCol(CONTENT_ALIASES);

  // If no content alias matched explicitly, pick the column with highest average character length
  if (contentIdx < 0 && dataRows.length > 0) {
    const numCols = Math.max(...dataRows.slice(0, 25).map((r) => r.length));
    let bestCol = 0;
    let bestAvgLen = -1;
    const sampleSlice = dataRows.slice(0, 40);
    for (let col = 0; col < numCols; col += 1) {
      if (col === idIdx || col === srcIdx || col === tierIdx || col === arrIdx || col === dateIdx) continue;
      const totalLen = sampleSlice.reduce((acc, r) => acc + (r[col]?.length || 0), 0);
      const avgLen = totalLen / Math.max(sampleSlice.length, 1);
      if (avgLen > bestAvgLen) {
        bestAvgLen = avgLen;
        bestCol = col;
      }
    }
    contentIdx = bestCol;
  }

  const isMrrCol = arrIdx >= 0 && headerNorms[arrIdx] === 'mrr';
  const usedIds = new Set<string>();
  const tickets: RawTicket[] = [];
  const skippedReasons: string[] = [];
  let sanitizedCount = 0;

  dataRows.forEach((cols, idx) => {
    const cleanCols = cols.map((c) => {
      const sanitized = sanitizeFormulaInjection(c);
      if (sanitized !== c.trim()) sanitizedCount += 1;
      return sanitized;
    });

    const primaryContent = contentIdx >= 0 ? (cleanCols[contentIdx] || '') : '';
    const subjectPart = subjectIdx >= 0 && subjectIdx !== contentIdx ? (cleanCols[subjectIdx] || '') : '';

    let mergedContent = '';
    if (subjectPart && primaryContent && !primaryContent.includes(subjectPart)) {
      mergedContent = `${subjectPart} — ${primaryContent}`;
    } else if (primaryContent) {
      mergedContent = primaryContent;
    } else {
      // Fallback: join any remaining non-ID text cells in this row so data is never silently dropped
      const fallbackText = cleanCols
        .filter((val, cIdx) => val && cIdx !== idIdx && cIdx !== srcIdx && cIdx !== tierIdx && cIdx !== arrIdx && cIdx !== dateIdx)
        .join(' — ')
        .trim();
      mergedContent = fallbackText;
    }

    // Collapse internal newlines cleanly into single spaces for stable rendering & API transport
    const cleanContent = mergedContent.replace(/\s+/g, ' ').trim();
    if (!cleanContent) {
      skippedReasons.push(`Row ${hasHeader ? idx + 2 : idx + 1}: empty feedback content`);
      return;
    }

    let id = (idIdx >= 0 && cleanCols[idIdx] ? cleanCols[idIdx] : '').trim();
    if (!id || id === cleanContent) {
      id = `CSV-${101 + idx}`;
    }
    if (usedIds.has(id)) {
      id = `${id}-${idx + 1}`;
    }
    usedIds.add(id);

    const source = srcIdx >= 0 && cleanCols[srcIdx] ? normalizeSource(cleanCols[srcIdx]) : 'CSV';
    const customer_tier = tierIdx >= 0 && cleanCols[tierIdx] ? normalizeTier(cleanCols[tierIdx]) : 'Standard';
    const arr_weight = arrIdx >= 0 && cleanCols[arrIdx] ? parseArrNumber(cleanCols[arrIdx], isMrrCol) : 0;
    const created_at =
      dateIdx >= 0 && cleanCols[dateIdx] ? cleanCols[dateIdx] : new Date().toISOString();

    tickets.push({
      id,
      source,
      customer_tier,
      arr_weight,
      content: cleanContent,
      created_at,
    });
  });

  return {
    tickets,
    totalDataRows: allDataRows.length,
    skippedRows: allDataRows.length - tickets.length,
    skippedReasons: skippedReasons.slice(0, 8),
    detectedColumns: {
      id: idIdx >= 0 ? headerLabels[idIdx] : undefined,
      source: srcIdx >= 0 ? headerLabels[srcIdx] : undefined,
      customer_tier: tierIdx >= 0 ? headerLabels[tierIdx] : undefined,
      arr_weight: arrIdx >= 0 ? headerLabels[arrIdx] : undefined,
      content: hasHeader && headerLabels[contentIdx] ? headerLabels[contentIdx] : `Column ${contentIdx + 1}`,
      created_at: dateIdx >= 0 ? headerLabels[dateIdx] : undefined,
    },
    delimiter,
    sanitizedCount,
    truncatedAtLimit,
  };
}
