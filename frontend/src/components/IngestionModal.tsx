import React, { useState } from 'react';
import { Upload, FileSpreadsheet, ShieldAlert, CheckCircle2, X, Sparkles } from 'lucide-react';
import {
  CustomerTier,
  RawTicket,
  TicketSource,
  sanitizeFormulaInjection,
} from '../lib/calculators';
import { CsvParseDiagnostics, parseCsvToTickets } from '../lib/csvParser';
import { SAMPLE_30_TICKETS } from '../lib/sampleData';
import { PostHogWindow } from './PostHogWindow';

interface IngestionModalProps {
  isOpen: boolean;
  onClose: () => void;
  onIngestTickets: (
    tickets: RawTicket[],
    batchLabel: string,
    diagnostics?: CsvParseDiagnostics
  ) => void;
}

export const IngestionModal: React.FC<IngestionModalProps> = ({
  isOpen,
  onClose,
  onIngestTickets,
}) => {
  const [rawText, setRawText] = useState<string>('');
  const [sanitizedCount, setSanitizedCount] = useState<number>(0);
  const [uploadError, setUploadError] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleParseRawPaste = () => {
    setUploadError(null);
    const trimmed = rawText.trim();
    if (!trimmed) {
      setUploadError('Paste pipe-delimited rows or CSV text before ingesting.');
      return;
    }

    // If pasted text looks like CSV (no pipes in first line, uses commas or tabs), parse via full RFC-4180 parser
    const firstLine = trimmed.split(/\r?\n/)[0] || '';
    if (!firstLine.includes('|') && (firstLine.includes(',') || firstLine.includes('\t') || firstLine.includes(';'))) {
      const diag = parseCsvToTickets(trimmed);
      if (diag.tickets.length === 0) {
        setUploadError('No valid feedback rows were found in the pasted CSV.');
        return;
      }
      setSanitizedCount(diag.sanitizedCount);
      onIngestTickets(
        diag.tickets,
        `Pasted CSV (${diag.tickets.length} rows)`,
        diag
      );
      onClose();
      return;
    }

    const lines = trimmed
      .split('\n')
      .map((l) => l.trim())
      .filter(Boolean);

    let strippedFormulas = 0;
    const usedIds = new Set<string>();
    const validSources = new Set(['Zendesk', 'Discord', 'Linear', 'AppStore', 'CSV']);
    const validTiers: CustomerTier[] = ['Enterprise', 'Mid-Market', 'Pro', 'Standard', 'Free'];

    const parsed: RawTicket[] = [];
    lines.forEach((line, index) => {
      const parts = line.split('|').map((p) => p.trim());
      if (parts.length >= 5) {
        const rawId = parts[0];
        const rawSource = parts[1] as TicketSource;
        const rawTier = parts[2] as CustomerTier;
        const parsedArr = Number(parts[3]);
        const rawArr = Number.isFinite(parsedArr) && parsedArr > 0 ? parsedArr : 0;
        const rawContent = parts.slice(4).join(' | ');

        const cleanId = sanitizeFormulaInjection(rawId) || `TCK-${101 + index}`;
        const cleanContent = sanitizeFormulaInjection(rawContent);
        if (cleanId !== rawId || cleanContent !== rawContent) {
          strippedFormulas += 1;
        }
        if (!cleanContent) return;

        let finalId = cleanId;
        if (usedIds.has(finalId)) finalId = `${finalId}-${index + 1}`;
        usedIds.add(finalId);

        parsed.push({
          id: finalId,
          source: validSources.has(rawSource) ? rawSource : (rawSource || 'CSV'),
          customer_tier: validTiers.includes(rawTier) ? rawTier : 'Standard',
          arr_weight: rawArr,
          content: cleanContent,
          created_at: new Date().toISOString(),
        });
        return;
      }

      const cleaned = sanitizeFormulaInjection(line);
      if (cleaned !== line) strippedFormulas += 1;
      if (!cleaned) return;

      let finalId = `TCK-${101 + index}`;
      while (usedIds.has(finalId)) finalId = `TCK-${101 + index}-${usedIds.size}`;
      usedIds.add(finalId);

      parsed.push({
        id: finalId,
        source: 'CSV',
        customer_tier: 'Standard',
        arr_weight: 0,
        content: cleaned,
        created_at: new Date().toISOString(),
      });
    });

    if (parsed.length === 0) {
      setUploadError('No valid lines found to ingest.');
      return;
    }
    setSanitizedCount(strippedFormulas);
    onIngestTickets(parsed, `Custom Sanitized Batch (${parsed.length} rows)`);
    onClose();
  };

  const handleCsvFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploadError(null);
    const reader = new FileReader();
    reader.onload = (event) => {
      const text = String(event.target?.result || '');
      const diag = parseCsvToTickets(text);
      if (diag.tickets.length === 0) {
        setUploadError('CSV file contained 0 valid feedback rows.');
        return;
      }
      setSanitizedCount(diag.sanitizedCount);
      onIngestTickets(diag.tickets, `CSV Upload: ${file.name} (${diag.tickets.length} rows)`, diag);
      onClose();
    };
    reader.readAsText(file);
  };

  return (
    <div className="fixed inset-0 z-50 bg-ink/50 overflow-y-auto flex items-center justify-center p-4">
      <div className="w-full max-w-2xl">
        <PostHogWindow
          title="Ingest Multi-Channel Feedback Batch"
          path="Stage 1 · CSV & Multi-Channel Parser"
          badgeText="RFC-4180 + Formula Guard"
          badgeVariant="orange"
          rightSlot={
            <button
              type="button"
              onClick={onClose}
              className="p-1 bg-cotton border border-rule-2 rounded-input hover:bg-paper-2"
              aria-label="Close modal"
            >
              <X className="w-4 h-4" />
            </button>
          }
        >
          <div className="space-y-4">
            {uploadError && (
              <div className="bg-error-soft border border-error text-error rounded-input px-3 py-2 text-xs">
                {uploadError}
              </div>
            )}

            <div className="bg-paper border border-rule rounded-stock p-3 flex items-start gap-3">
              <ShieldAlert className="w-5 h-5 text-paid shrink-0 mt-0.5" />
              <div className="text-xs leading-relaxed text-ink-2">
                <strong className="text-ink">Full RFC-4180 Ingestion &amp; Security Guard:</strong>{' '}
                Preserves multi-line quoted CSV cells, auto-detects comma/tab/semicolon delimiters and
                custom headers up to <strong>2,000 rows</strong>, and strips formula-injection prefixes (
                <code className="font-mono bg-cotton px-1 border border-rule">=</code>,{' '}
                <code className="font-mono bg-cotton px-1 border border-rule">+</code>,{' '}
                <code className="font-mono bg-cotton px-1 border border-rule">-</code>,{' '}
                <code className="font-mono bg-cotton px-1 border border-rule">@</code>).
              </div>
            </div>

            <div className="bg-paper border border-rule rounded-stock p-3.5 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
              <div>
                <div className="font-semibold text-sm flex items-center gap-1.5 text-ink">
                  <Sparkles className="w-4 h-4 text-paid" />
                  Canonical 30-row multi-channel B2B dataset
                </div>
                <p className="text-xs text-muted mt-0.5">
                  Zendesk (12) + Discord (6) + Linear (7) + AppStore (5) = $2.01M attributed ARR
                </p>
              </div>
              <button
                type="button"
                onClick={() => {
                  onIngestTickets(SAMPLE_30_TICKETS, 'Canonical 30-Row Multi-Channel Batch');
                  onClose();
                }}
                className="cs-btn-secondary text-xs shrink-0 whitespace-nowrap"
              >
                Load 30-row sample
              </button>
            </div>

            <label className="block border border-dashed border-rule-2 rounded-stock bg-paper hover:bg-paper-2 transition-colors p-4 text-center cursor-pointer">
              <Upload className="w-5 h-5 mx-auto mb-1 text-paid" />
              <div className="font-semibold text-xs text-ink">
                Upload CSV / TSV file (up to 2,000 rows, multi-line cells supported)
              </div>
              <div className="text-xs text-muted mt-0.5">
                Auto-maps headers such as <code className="font-mono">id, source/channel, tier, arr/mrr, feedback/description</code>
              </div>
              <input
                type="file"
                accept=".csv,.tsv,text/csv,text/tab-separated-values"
                onChange={handleCsvFileUpload}
                className="hidden"
              />
            </label>

            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label htmlFor="raw-paste-tickets" className="text-xs font-medium text-ink-2">
                  Or paste raw feedback rows (pipe-delimited or CSV)
                </label>
                <span className="text-xs text-success font-medium flex items-center gap-1">
                  <CheckCircle2 className="w-3.5 h-3.5" /> {sanitizedCount} prefixes stripped
                </span>
              </div>
              <textarea
                id="raw-paste-tickets"
                rows={4}
                value={rawText}
                onChange={(e) => setRawText(e.target.value)}
                placeholder="Example: TCK-201 | Zendesk | Enterprise | 85000 | Okta SAML throws 403 InvalidAudience"
                className="cs-input font-mono text-xs"
              />
            </div>

            <div className="flex items-center justify-end gap-2 pt-2 border-t border-rule">
              <button type="button" onClick={onClose} className="cs-btn-secondary text-xs whitespace-nowrap">
                Cancel
              </button>
              <button
                type="button"
                onClick={handleParseRawPaste}
                className="cs-btn-primary text-xs whitespace-nowrap"
              >
                <FileSpreadsheet className="w-4 h-4" />
                Sanitize and ingest
              </button>
            </div>
          </div>
        </PostHogWindow>
      </div>
    </div>
  );
};
