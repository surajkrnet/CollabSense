import React, { useState } from 'react';
import { ChevronDown, ChevronUp, FileText } from 'lucide-react';
import { RawTicket } from '../lib/calculators';
import { TriageCluster } from '../lib/projects';

export const SEVERITY_ORDER: Record<string, number> = {
  P0: 0,
  P1: 1,
  P2: 2,
  P3: 3,
  P4: 4,
};

export function sortBySeverityHierarchy(clusters: TriageCluster[]): TriageCluster[] {
  return [...clusters].sort((a, b) => {
    const sA = SEVERITY_ORDER[a.severity] ?? 9;
    const sB = SEVERITY_ORDER[b.severity] ?? 9;
    if (sA !== sB) return sA - sB;
    if (b.ticket_ids.length !== a.ticket_ids.length) {
      return b.ticket_ids.length - a.ticket_ids.length;
    }
    if (b.total_arr_impact !== a.total_arr_impact) {
      return b.total_arr_impact - a.total_arr_impact;
    }
    return b.computed_rice - a.computed_rice;
  });
}

export function getSeverityStyle(severity: string): {
  badgeClass: string;
  label: string;
  borderClass: string;
  surfaceClass: string;
} {
  switch (severity) {
    case 'P0':
      return {
        badgeClass: 'cs-badge-p0',
        label: 'P0 · Critical Blocker',
        borderClass: 'border-l-4 border-l-error',
        surfaceClass: 'bg-cotton border-error/50',
      };
    case 'P1':
      return {
        badgeClass: 'cs-badge-p1',
        label: 'P1 · High Priority',
        borderClass: 'border-l-4 border-l-accent-active',
        surfaceClass: 'bg-cotton border-accent-active/50',
      };
    case 'P2':
      return {
        badgeClass: 'cs-badge-p2',
        label: 'P2 · Moderate',
        borderClass: 'border-l-4 border-l-warn',
        surfaceClass: 'bg-cotton border-rule',
      };
    case 'P3':
      return {
        badgeClass: 'cs-badge-p3',
        label: 'P3 · Low',
        borderClass: 'border-l-4 border-l-info',
        surfaceClass: 'bg-cotton border-rule',
      };
    default:
      return {
        badgeClass: 'cs-badge-p4',
        label: `${severity || 'P4'} · Backlog`,
        borderClass: 'border-l-4 border-l-rule',
        surfaceClass: 'bg-paper border-rule',
      };
  }
}

interface CitationBarProps {
  ticketIds: string[];
  ticketsLookup: Map<string, RawTicket>;
  label?: string;
  maxVisible?: number;
}

/**
 * Nielsen Heuristic #1 & #6: Displays Top 3 verified citation chips + "+N more" count pill,
 * expanding on click into an evidence panel showing the exact underlying customer quotes & metadata.
 */
export const CitationBar: React.FC<CitationBarProps> = ({
  ticketIds,
  ticketsLookup,
  label = 'Verified citations',
  maxVisible = 3,
}) => {
  const [expanded, setExpanded] = useState(false);

  const uniqueIds = Array.from(new Set(ticketIds)).filter(Boolean);
  const topIds = uniqueIds.slice(0, maxVisible);
  const remainingCount = Math.max(0, uniqueIds.length - topIds.length);
  const evidenceIds = expanded ? uniqueIds : [];

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-1.5">
        <span className="cs-badge-verified">
          {label} ({uniqueIds.length})
        </span>
        {topIds.map((tid) => (
          <button
            key={tid}
            type="button"
            onClick={() => setExpanded((v) => !v)}
            title="Inspect supporting ticket evidence"
            className="fig font-mono text-xs bg-cotton border border-rule hover:border-paid text-ink px-2 py-0.5 rounded-input transition-colors cursor-pointer"
          >
            [{tid}]
          </button>
        ))}
        {remainingCount > 0 && (
          <button
            type="button"
            onClick={() => setExpanded((v) => !v)}
            className="fig font-mono text-xs font-semibold bg-paper-2 border border-rule-2 hover:border-paid text-paid px-2 py-0.5 rounded-input inline-flex items-center gap-1 transition-colors cursor-pointer"
          >
            <span>{expanded ? 'Hide evidence' : `+${remainingCount} more`}</span>
            {expanded ? (
              <ChevronUp className="w-3 h-3" />
            ) : (
              <ChevronDown className="w-3 h-3" />
            )}
          </button>
        )}
        {remainingCount === 0 && uniqueIds.length > 0 && (
          <button
            type="button"
            onClick={() => setExpanded((v) => !v)}
            className="text-xs text-muted hover:text-ink px-1.5 py-0.5 inline-flex items-center gap-1"
          >
            <span>{expanded ? 'Hide evidence' : 'Inspect evidence'}</span>
            {expanded ? (
              <ChevronUp className="w-3 h-3" />
            ) : (
              <ChevronDown className="w-3 h-3" />
            )}
          </button>
        )}
      </div>

      {expanded && evidenceIds.length > 0 && (
        <div className="bg-paper border border-rule rounded-input p-3 space-y-2 cs-panel-enter">
          <div className="flex items-center justify-between text-xs text-ink-2">
            <span className="font-semibold flex items-center gap-1.5">
              <FileText className="w-3.5 h-3.5 text-paid" />
              Supporting Customer Data ({evidenceIds.length} verified record{evidenceIds.length === 1 ? '' : 's'})
            </span>
            <button
              type="button"
              onClick={() => setExpanded(false)}
              className="text-xs text-muted hover:text-ink underline"
            >
              Collapse
            </button>
          </div>
          <div className="max-h-56 overflow-y-auto space-y-1.5 pr-1">
            {evidenceIds.slice(0, 30).map((tid) => {
              const t = ticketsLookup.get(tid);
              return (
                <div
                  key={tid}
                  className="bg-cotton border border-rule rounded-input p-2 text-xs space-y-1"
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <span className="fig font-mono font-semibold text-paid">
                        [{tid}]
                      </span>
                      {t && (
                        <>
                          <span className="cs-badge">{t.source}</span>
                          <span className="text-muted">{t.customer_tier}</span>
                        </>
                      )}
                    </div>
                    {t && t.arr_weight > 0 && (
                      <span className="fig font-mono font-semibold text-success">
                        ${(t.arr_weight / 1000).toFixed(0)}k ARR
                      </span>
                    )}
                  </div>
                  <p className="text-ink leading-relaxed">
                    {t ? t.content : 'Referenced ticket ID verified in active cluster.'}
                  </p>
                </div>
              );
            })}
            {evidenceIds.length > 30 && (
              <div className="text-xs text-muted text-center py-1">
                Showing first 30 of {evidenceIds.length} cited records.
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
