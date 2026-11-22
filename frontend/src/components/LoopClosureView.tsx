import React, { useEffect, useMemo, useState } from 'react';
import {
  Check,
  CheckCircle2,
  Copy,
  Download,
  Mail,
  MessageSquare,
  RefreshCw,
  Send,
  Sparkles,
} from 'lucide-react';
import { RawTicket } from '../lib/calculators';
import { LoopClosureDraftItem } from '../lib/projects';
import { CitationBar } from './CitationBar';
import { PostHogWindow } from './PostHogWindow';

interface LoopClosureViewProps {
  loopClosures: LoopClosureDraftItem[];
  hasClusters: boolean;
  hasTickets: boolean;
  ticketsLookup: Map<string, RawTicket>;
  isGeneratingLoops: boolean;
  copiedDraftId: string | null;
  onGenerateAllAi: () => void;
  onUpdateDraft: (
    draftId: string,
    field: 'subject' | 'message_body' | 'channel' | 'internal_playbook_note',
    value: string
  ) => void;
  onStatusChange: (
    draftId: string,
    status: 'DRAFT' | 'APPROVED_TO_SEND' | 'SENT'
  ) => void;
  onCopyDraft: (draft: LoopClosureDraftItem) => void;
  onGoToUpload: () => void;
  onRunClustering: () => void;
}

export const LoopClosureView: React.FC<LoopClosureViewProps> = ({
  loopClosures,
  hasClusters,
  hasTickets,
  ticketsLookup,
  isGeneratingLoops,
  copiedDraftId,
  onGenerateAllAi,
  onUpdateDraft,
  onStatusChange,
  onCopyDraft,
  onGoToUpload,
  onRunClustering,
}) => {
  const [selectedDraftId, setSelectedDraftId] = useState<string>(
    () => loopClosures[0]?.draft_id || ''
  );
  const [statusFilter, setStatusFilter] = useState<'ALL' | 'DRAFT' | 'APPROVED_TO_SEND' | 'SENT'>('ALL');
  const [channelFilter, setChannelFilter] = useState<string>('ALL');
  const [composerTab, setComposerTab] = useState<'customer' | 'playbook'>('customer');

  useEffect(() => {
    if (loopClosures.length > 0 && !loopClosures.some((d) => d.draft_id === selectedDraftId)) {
      setSelectedDraftId(loopClosures[0].draft_id);
    }
  }, [loopClosures, selectedDraftId]);

  const filteredQueue = useMemo(() => {
    return loopClosures.filter((d) => {
      const okStatus = statusFilter === 'ALL' || d.status === statusFilter;
      const okChan = channelFilter === 'ALL' || d.channel === channelFilter;
      return okStatus && okChan;
    });
  }, [loopClosures, statusFilter, channelFilter]);

  const activeDraft =
    filteredQueue.find((d) => d.draft_id === selectedDraftId) ||
    loopClosures.find((d) => d.draft_id === selectedDraftId) ||
    filteredQueue[0] ||
    loopClosures[0];

  const stats = useMemo(() => {
    const sent = loopClosures.filter((d) => d.status === 'SENT').length;
    const ready = loopClosures.filter((d) => d.status === 'APPROVED_TO_SEND').length;
    const totalNotifiedTickets = Array.from(
      new Set(loopClosures.filter((d) => d.status === 'SENT').flatMap((d) => d.cited_tickets))
    ).length;
    const totalTickets = Array.from(new Set(loopClosures.flatMap((d) => d.cited_tickets))).length;
    return { sent, ready, total: loopClosures.length, totalNotifiedTickets, totalTickets };
  }, [loopClosures]);

  const handleExportChangelog = () => {
    const lines = [
      '# Customer Loop Closure & Support Playbook Bundle',
      '',
      ...loopClosures.map(
        (d) =>
          `## [${d.channel}] ${d.subject} (${d.cluster_id} — ${d.status})\n` +
          `**Audience:** ${d.recipient_segment}\n\n` +
          `${d.message_body}\n\n` +
          (d.internal_playbook_note ? `**Internal Playbook:** ${d.internal_playbook_note}\n\n` : '') +
          `---\n`
      ),
    ];
    const blob = new Blob([lines.join('\n')], { type: 'text/markdown;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'collabsense-loop-closure-updates.md';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  if (loopClosures.length === 0) {
    return (
      <div className="space-y-5">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-ink">
            Stage 8: Closing the Loop &amp; Release Comms
          </h1>
          <p className="text-xs sm:text-sm text-ink-2 mt-1">
            Notify affected customers across Zendesk, Discord, Email, and Linear and keep Support aligned.
          </p>
        </div>

        <div className="cs-card p-6 text-center space-y-3">
          <Mail className="w-6 h-6 mx-auto text-paid" />
          <p className="text-sm font-semibold text-ink">No customer update drafts generated yet</p>
          <p className="text-xs text-ink-2">
            Upload feedback in Stage 1 and run AI clustering to automatically prepare personalized customer updates.
          </p>
          <button
            type="button"
            onClick={!hasTickets ? onGoToUpload : onRunClustering}
            className="cs-btn-primary text-xs"
          >
            {!hasTickets ? 'Go to Stage 1: Upload Data' : 'Generate Clusters & Drafts'}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Clean Header & Progress Meter */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-ink">
            Stage 8: Closing the Loop &amp; Release Comms
          </h1>
          <p className="text-xs sm:text-sm text-ink-2 mt-0.5">
            Select a cluster draft from the queue to review cited tickets, customize customer outreach, or edit internal Support notes.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <div className="bg-cotton border border-rule rounded-input px-3 py-1.5 text-xs flex items-center gap-2">
            <CheckCircle2 className="w-3.5 h-3.5 text-success" />
            <span className="fig font-mono font-semibold text-ink">
              {stats.sent}/{stats.total} sent
            </span>
            <span className="text-muted">
              ({stats.totalNotifiedTickets}/{stats.totalTickets} tickets closed)
            </span>
          </div>
          <button
            type="button"
            onClick={handleExportChangelog}
            className="cs-btn-secondary text-xs whitespace-nowrap"
          >
            <Download className="w-3.5 h-3.5" />
            <span>Export Bundle</span>
          </button>
          {hasClusters && (
            <button
              type="button"
              data-testid="generate-loop-closures-ai-btn"
              disabled={isGeneratingLoops}
              onClick={onGenerateAllAi}
              className="cs-btn-primary text-xs whitespace-nowrap"
            >
              {isGeneratingLoops ? (
                <RefreshCw className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <Sparkles className="w-3.5 h-3.5" />
              )}
              <span>{isGeneratingLoops ? 'Drafting AI Updates…' : 'Draft All with AI'}</span>
            </button>
          )}
        </div>
      </div>

      {/* Master-Detail Workspace (Nielsen #8 Aesthetic & Minimalist Design) */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-start">
        {/* LEFT QUEUE */}
        <div className="lg:col-span-4 space-y-3">
          <div className="cs-card p-3 space-y-2.5">
            <div className="flex flex-wrap gap-1 text-xs">
              {(
                [
                  { id: 'ALL', label: `All (${loopClosures.length})` },
                  { id: 'DRAFT', label: 'Draft' },
                  { id: 'APPROVED_TO_SEND', label: 'Ready' },
                  { id: 'SENT', label: 'Sent' },
                ] as const
              ).map((s) => (
                <button
                  key={s.id}
                  type="button"
                  onClick={() => setStatusFilter(s.id)}
                  className={`px-2 py-1 rounded-input border font-medium ${
                    statusFilter === s.id
                      ? 'bg-paper-2 border-paid text-paid font-semibold'
                      : 'bg-cotton border-rule text-muted hover:text-ink'
                  }`}
                >
                  {s.label}
                </button>
              ))}
            </div>

            <div className="flex items-center justify-between text-xs">
              <span className="text-muted">Channel:</span>
              <select
                value={channelFilter}
                onChange={(e) => setChannelFilter(e.target.value)}
                className="bg-paper border border-rule rounded-input px-2 py-1 text-xs text-ink"
              >
                <option value="ALL">All Channels</option>
                <option value="Zendesk">Zendesk</option>
                <option value="Discord">Discord</option>
                <option value="Email">Email</option>
                <option value="Linear">Linear</option>
              </select>
            </div>
          </div>

          <div className="space-y-2 max-h-[540px] overflow-y-auto pr-1">
            {filteredQueue.length === 0 ? (
              <div className="cs-card p-4 text-xs text-muted text-center">
                No drafts match the selected filters.
              </div>
            ) : (
              filteredQueue.map((lc) => {
                const isSelected = activeDraft?.draft_id === lc.draft_id;
                return (
                  <button
                    key={lc.draft_id}
                    type="button"
                    onClick={() => setSelectedDraftId(lc.draft_id)}
                    className={`w-full text-left p-3 rounded-card border transition-colors space-y-1.5 ${
                      isSelected
                        ? 'bg-cotton border-2 border-accent-active'
                        : 'bg-cotton border-rule hover:bg-paper'
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2 text-xs">
                      <div className="flex items-center gap-1.5">
                        <span className="cs-badge">{lc.channel}</span>
                        <span className="fig font-mono font-semibold text-paid">
                          {lc.cluster_id}
                        </span>
                      </div>
                      <span
                        className={
                          lc.status === 'SENT'
                            ? 'cs-badge-verified'
                            : lc.status === 'APPROVED_TO_SEND'
                            ? 'stamp-settled text-[11px]'
                            : 'cs-badge'
                        }
                      >
                        {lc.status === 'APPROVED_TO_SEND' ? 'READY' : lc.status}
                      </span>
                    </div>
                    <div className="font-semibold text-xs text-ink line-clamp-2">
                      {lc.theme_title}
                    </div>
                    <div className="text-[11px] text-muted">
                      {lc.cited_tickets.length} cited ticket(s)
                    </div>
                  </button>
                );
              })
            )}
          </div>
        </div>

        {/* RIGHT FOCUSED COMPOSER */}
        {activeDraft && (
          <div className="lg:col-span-8">
            <PostHogWindow
              title={`Compose Update: ${activeDraft.cluster_id}`}
              path={`${activeDraft.draft_id} · ${activeDraft.channel}`}
              badgeText={
                activeDraft.status === 'APPROVED_TO_SEND' ? 'READY TO SEND' : activeDraft.status
              }
              badgeVariant={activeDraft.status === 'SENT' ? 'green' : 'orange'}
              rightSlot={
                <div className="flex items-center gap-1.5">
                  <button
                    type="button"
                    onClick={() => onCopyDraft(activeDraft)}
                    className="cs-btn-secondary py-1 px-2.5 text-xs min-h-[30px]"
                  >
                    {copiedDraftId === activeDraft.draft_id ? (
                      <Check className="w-3.5 h-3.5 text-success" />
                    ) : (
                      <Copy className="w-3.5 h-3.5" />
                    )}
                    <span>{copiedDraftId === activeDraft.draft_id ? 'Copied' : 'Copy'}</span>
                  </button>
                </div>
              }
            >
              <div className="space-y-4">
                {/* Metadata Strip */}
                <div className="bg-paper border border-rule rounded-input p-3 flex flex-wrap items-center justify-between gap-3 text-xs">
                  <div className="space-y-0.5 min-w-0">
                    <div className="font-semibold text-sm text-ink truncate">
                      {activeDraft.theme_title}
                    </div>
                    <div className="text-ink-2">
                      Audience: <strong className="text-ink">{activeDraft.recipient_segment}</strong>
                    </div>
                  </div>

                  <div className="flex flex-wrap items-center gap-2">
                    <select
                      aria-label="Channel"
                      value={activeDraft.channel}
                      onChange={(e) => onUpdateDraft(activeDraft.draft_id, 'channel', e.target.value)}
                      className="bg-cotton border border-rule rounded-input px-2.5 py-1 text-xs font-medium text-ink"
                    >
                      <option value="Zendesk">Zendesk</option>
                      <option value="Discord">Discord</option>
                      <option value="Email">Email</option>
                      <option value="Linear">Linear</option>
                    </select>

                    <div className="flex items-center gap-1 p-0.5 stock-groove">
                      {(
                        [
                          { id: 'DRAFT', label: 'Draft' },
                          { id: 'APPROVED_TO_SEND', label: 'Ready' },
                          { id: 'SENT', label: 'Sent' },
                        ] as const
                      ).map((st) => (
                        <button
                          key={st.id}
                          type="button"
                          onClick={() => onStatusChange(activeDraft.draft_id, st.id)}
                          className={`px-2 py-1 rounded-input text-xs font-medium ${
                            activeDraft.status === st.id
                              ? 'stock-card text-paid font-semibold'
                              : 'text-muted hover:text-ink'
                          }`}
                        >
                          {st.label}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>

                {/* Top 3 + N Citations */}
                <CitationBar
                  ticketIds={activeDraft.cited_tickets}
                  ticketsLookup={ticketsLookup}
                  label="Notifying affected customers"
                  maxVisible={3}
                />

                {/* Focused Tab Switcher (Customer Comms vs Internal Support Playbook) */}
                <div className="flex items-center gap-1 border-b border-rule">
                  <button
                    type="button"
                    onClick={() => setComposerTab('customer')}
                    className={`px-3 py-2 text-xs font-semibold border-b-2 inline-flex items-center gap-1.5 ${
                      composerTab === 'customer'
                        ? 'border-paid text-ink'
                        : 'border-transparent text-muted hover:text-ink'
                    }`}
                  >
                    <MessageSquare className="w-3.5 h-3.5" />
                    <span>Customer Notification</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setComposerTab('playbook')}
                    className={`px-3 py-2 text-xs font-semibold border-b-2 inline-flex items-center gap-1.5 ${
                      composerTab === 'playbook'
                        ? 'border-paid text-ink'
                        : 'border-transparent text-muted hover:text-ink'
                    }`}
                  >
                    <Mail className="w-3.5 h-3.5" />
                    <span>Internal Support &amp; Sales Playbook</span>
                  </button>
                </div>

                {composerTab === 'customer' ? (
                  <div className="space-y-3">
                    <div>
                      <label htmlFor="draft-subject" className="text-xs font-medium text-ink-2 block mb-1">
                        Subject / Headline
                      </label>
                      <input
                        id="draft-subject"
                        type="text"
                        value={activeDraft.subject}
                        onChange={(e) => onUpdateDraft(activeDraft.draft_id, 'subject', e.target.value)}
                        className="cs-input text-xs font-medium"
                      />
                    </div>
                    <div>
                      <label htmlFor="draft-body" className="text-xs font-medium text-ink-2 block mb-1">
                        Customer Message Body
                      </label>
                      <textarea
                        id="draft-body"
                        rows={7}
                        value={activeDraft.message_body}
                        onChange={(e) =>
                          onUpdateDraft(activeDraft.draft_id, 'message_body', e.target.value)
                        }
                        className="w-full bg-paper border border-rule rounded-input p-3 text-xs text-ink leading-relaxed focus:outline-none focus:border-paid"
                      />
                    </div>
                  </div>
                ) : (
                  <div className="space-y-2">
                    <label htmlFor="draft-playbook" className="text-xs font-medium text-ink-2 block">
                      Internal Support &amp; Sales Release Note (prevents duplicate issue logging)
                    </label>
                    <textarea
                      id="draft-playbook"
                      rows={8}
                      value={activeDraft.internal_playbook_note || ''}
                      onChange={(e) =>
                        onUpdateDraft(activeDraft.draft_id, 'internal_playbook_note', e.target.value)
                      }
                      placeholder="Summarize root fix, affected version tag, and ticket closure macro for Support/Sales…"
                      className="w-full bg-paper border border-rule rounded-input p-3 text-xs text-ink leading-relaxed focus:outline-none focus:border-paid"
                    />
                  </div>
                )}

                {/* Action Footer */}
                <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-rule">
                  <span className="text-xs text-muted">
                    All edits auto-save to Supabase &amp; activity audit log
                  </span>
                  <div className="flex items-center gap-2">
                    {activeDraft.status !== 'SENT' ? (
                      <button
                        type="button"
                        data-testid={`send-loop-closure-${activeDraft.draft_id}`}
                        onClick={() => onStatusChange(activeDraft.draft_id, 'SENT')}
                        className="cs-btn-primary text-xs px-4"
                      >
                        <Send className="w-3.5 h-3.5" />
                        <span>Mark Update Sent</span>
                      </button>
                    ) : (
                      <button
                        type="button"
                        onClick={() => onStatusChange(activeDraft.draft_id, 'DRAFT')}
                        className="cs-btn-secondary text-xs px-3"
                      >
                        Reopen as Draft
                      </button>
                    )}
                  </div>
                </div>
              </div>
            </PostHogWindow>
          </div>
        )}
      </div>
    </div>
  );
};
