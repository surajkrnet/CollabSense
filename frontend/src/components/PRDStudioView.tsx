import React, { useMemo, useState } from 'react';
import {
  ArrowRight,
  Bot,
  Check,
  CheckCircle2,
  Copy,
  Download,
  FileCode2,
  RefreshCw,
  Send,
  ShieldCheck,
  Sparkles,
  Undo2,
} from 'lucide-react';
import { GeneratedPRD, RawTicket } from '../lib/calculators';
import { PRDChatMessage, TriageCluster } from '../lib/projects';
import { CitationBar, getSeverityStyle } from './CitationBar';
import { PostHogWindow } from './PostHogWindow';

interface PRDStudioViewProps {
  clusters: TriageCluster[];
  selectedClusterId: string;
  onSelectClusterId: (id: string) => void;
  activePrd: GeneratedPRD | null;
  editableMarkdown: string;
  onEditableMarkdownChange: (md: string) => void;
  pmNotes: string;
  onPmNotesChange: (notes: string) => void;
  isRunningStage: boolean;
  onSynthesizePrd: (cluster: TriageCluster) => void;
  onApplyChatPrdUpdate: (
    cluster: TriageCluster,
    updatedPrd: GeneratedPRD,
    userMsg: PRDChatMessage,
    assistantMsg: PRDChatMessage
  ) => void;
  chatHistory: PRDChatMessage[];
  ticketsLookup: Map<string, RawTicket>;
  apiBase: string;
  getAuthHeaders: () => Promise<Record<string, string>>;
  projectName: string;
  okrFocus: string;
  onCopyMarkdown: () => void;
  copiedMd: boolean;
  onDownloadMarkdown: () => void;
  onExportLinear: () => void;
  linearExportResult: { identifier: string; url: string; mutation: string } | null;
  onGoToStage: (view: 'upload' | 'intent') => void;
}

const QUICK_PROMPTS: { label: string; prompt: string }[] = [
  {
    label: 'Draft full PRD',
    prompt: 'Draft a complete engineering-ready PRD with crisp acceptance criteria, edge cases, and telemetry.',
  },
  {
    label: 'Add Gherkin edge cases',
    prompt: 'Add 2 failure-mode Gherkin Given/When/Then scenarios covering concurrency and error recovery.',
  },
  {
    label: 'Add security & privacy',
    prompt: 'Strengthen defensive_edge_cases with auth, tenant isolation, and input validation guardrails.',
  },
  {
    label: 'Tighten exec summary',
    prompt: 'Tighten executive_problem_statement and strategic_narrative to concise bullets citing customer feedback.',
  },
  {
    label: 'Add telemetry KPIs',
    prompt: 'Add concrete post-release telemetry events and latency/error SLAs to telemetry_events.',
  },
  {
    label: 'Add canary & rollback',
    prompt: 'Update rollout_plan with feature-flag canary percentages, monitoring checkpoints, and rollback trigger.',
  },
];

const SECTION_LABELS: Record<string, string> = {
  title: 'Title',
  executive_problem_statement: 'Executive Problem Statement',
  target_persona: 'Target Persona',
  strategic_narrative: 'Strategic Narrative',
  user_stories: 'Gherkin Acceptance Criteria',
  defensive_edge_cases: 'Defensive Edge Cases',
  telemetry_events: 'Telemetry & KPIs',
  rollout_plan: 'Phased Rollout Plan',
};

export const PRDStudioView: React.FC<PRDStudioViewProps> = ({
  clusters,
  selectedClusterId,
  onSelectClusterId,
  activePrd,
  editableMarkdown,
  onEditableMarkdownChange,
  pmNotes,
  onPmNotesChange,
  isRunningStage,
  onSynthesizePrd,
  onApplyChatPrdUpdate,
  chatHistory,
  ticketsLookup,
  apiBase,
  getAuthHeaders,
  projectName,
  okrFocus,
  onCopyMarkdown,
  copiedMd,
  onDownloadMarkdown,
  onExportLinear,
  linearExportResult,
  onGoToStage,
}) => {
  const [viewMode, setViewMode] = useState<'preview' | 'markdown' | 'split'>('preview');
  const [instruction, setInstruction] = useState('');
  const [isRefining, setIsRefining] = useState(false);
  const [chatError, setChatError] = useState<string | null>(null);
  const [highlightedSections, setHighlightedSections] = useState<string[]>([]);
  const [undoStack, setUndoStack] = useState<GeneratedPRD[]>([]);

  const selectedCluster =
    clusters.find((c) => c.cluster_id === selectedClusterId) || clusters[0];

  const completeness = useMemo(() => {
    if (!activePrd) return { done: 0, total: 5 };
    let done = 0;
    if (activePrd.executive_problem_statement?.trim()) done += 1;
    if (activePrd.target_persona?.trim()) done += 1;
    if ((activePrd.user_stories?.length || 0) >= 3) done += 1;
    if ((activePrd.defensive_edge_cases?.length || 0) >= 2) done += 1;
    if ((activePrd.telemetry_events?.length || 0) >= 2) done += 1;
    return { done, total: 5 };
  }, [activePrd]);

  const handleSendInstruction = async (rawPrompt: string) => {
    const clean = rawPrompt.trim();
    if (!clean || !selectedCluster || isRefining) return;
    setChatError(null);
    setInstruction('');
    setIsRefining(true);

    if (activePrd) {
      setUndoStack((prev) => [...prev.slice(-7), activePrd]);
    }

    const userTurn: PRDChatMessage = {
      id: `PRD-USR-${Date.now()}`,
      role: 'user',
      content: clean,
      timestamp: new Date().toISOString(),
    };

    try {
      const headers = await getAuthHeaders();
      const resp = await fetch(`${apiBase}/api/v1/prd/chat`, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          cluster: selectedCluster,
          current_prd: activePrd,
          instruction: clean,
          history: chatHistory.slice(-6).map((m) => ({ role: m.role, content: m.content })),
          project_name: projectName,
          okr_focus: okrFocus,
        }),
      });
      if (!resp.ok) {
        const txt = await resp.text().catch(() => '');
        setChatError(`PRD Assistant returned HTTP ${resp.status}${txt ? `: ${txt.slice(0, 120)}` : ''}`);
        setIsRefining(false);
        return;
      }
      const data = await resp.json();
      const changed: string[] = Array.isArray(data.changed_sections) ? data.changed_sections : [];
      const assistantTurn: PRDChatMessage = {
        id: `PRD-AST-${Date.now()}`,
        role: 'assistant',
        content: data.assistant_reply || 'Updated live PRD draft.',
        changedSections: changed,
        modelUsed: data.model_used,
        latencyMs: data.latency_ms,
        timestamp: new Date().toISOString(),
      };
      setHighlightedSections(changed);
      onApplyChatPrdUpdate(selectedCluster, data.updated_prd, userTurn, assistantTurn);
      if (viewMode === 'markdown') {
        setViewMode('split');
      }
    } catch (err) {
      setChatError(
        `Could not reach PRD Assistant (${err instanceof Error ? err.message : 'network error'}).`
      );
    } finally {
      setIsRefining(false);
    }
  };

  const handleUndo = () => {
    const prevPrd = undoStack[undoStack.length - 1];
    if (!prevPrd || !selectedCluster) return;
    setUndoStack((s) => s.slice(0, -1));
    setHighlightedSections([]);
    onApplyChatPrdUpdate(
      selectedCluster,
      prevPrd,
      {
        id: `PRD-UNDO-${Date.now()}`,
        role: 'user',
        content: 'Reverted last PRD edit',
        timestamp: new Date().toISOString(),
      },
      {
        id: `PRD-UNDO-AST-${Date.now()}`,
        role: 'assistant',
        content: 'Restored the previous PRD snapshot in the live viewer.',
        changedSections: [],
        timestamp: new Date().toISOString(),
      }
    );
  };

  const sectionHighlightClass = (key: string) =>
    highlightedSections.includes(key)
      ? 'border-2 border-accent-active bg-cotton ring-1 ring-accent/30'
      : 'border border-rule bg-cotton';

  if (!selectedCluster || !activePrd) {
    return (
      <div className="space-y-5">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-ink">
            Stage 6: AI PRD Drafting Studio &amp; Live Viewer
          </h1>
          <p className="text-xs sm:text-sm text-ink-2 mt-1">
            Co-author engineering-ready specs with the interactive AI PRD Assistant and preview live updates side by side.
          </p>
        </div>
        <div className="cs-card p-6 text-center space-y-3">
          <p className="text-sm font-semibold text-ink">No problem clusters available for PRD drafting yet</p>
          <p className="text-xs text-ink-2">
            Ingest customer feedback in Stage 1 and run Stage 3 clustering first.
          </p>
          <div className="flex items-center justify-center gap-2">
            <button type="button" onClick={() => onGoToStage('upload')} className="cs-btn-primary text-xs">
              Go to Stage 1: Upload Data
            </button>
            <button type="button" onClick={() => onGoToStage('intent')} className="cs-btn-secondary text-xs">
              Go to Stage 3: Intent &amp; Clusters
            </button>
          </div>
        </div>
      </div>
    );
  }

  const sevStyle = getSeverityStyle(selectedCluster.severity);

  return (
    <div className="space-y-4">
      {/* Nielsen #1 Visibility of System Status & #3 User Control Top Bar */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-ink">
            Stage 6: Interactive PRD Studio &amp; Live Spec Viewer
          </h1>
          <p className="text-xs sm:text-sm text-ink-2 mt-0.5">
            Chat with the PRD Co-Pilot on the left and watch structured sections &amp; Markdown update live on the right.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <select
            aria-label="Select cluster for PRD"
            value={selectedCluster.cluster_id}
            onChange={(e) => {
              setHighlightedSections([]);
              onSelectClusterId(e.target.value);
            }}
            className="bg-cotton border border-rule-2 rounded-input px-3 py-1.5 text-xs font-medium text-ink max-w-xs"
          >
            {clusters.map((c) => (
              <option key={c.cluster_id} value={c.cluster_id}>
                [{c.severity}] {c.cluster_id}: {c.theme_title} (RICE {c.computed_rice})
              </option>
            ))}
          </select>

          <button
            type="button"
            onClick={() => onSynthesizePrd(selectedCluster)}
            disabled={isRunningStage}
            className="cs-btn-secondary text-xs whitespace-nowrap"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isRunningStage ? 'animate-spin' : ''}`} />
            <span>{isRunningStage ? 'Synthesizing…' : 'Regenerate AI PRD'}</span>
          </button>
        </div>
      </div>

      {/* Toolbar: Completeness Meter + View Mode + Undo + Export */}
      <div className="cs-card p-3 flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-3 text-xs">
          <span className={sevStyle.badgeClass}>{selectedCluster.severity}</span>
          <span className="fig font-mono font-semibold text-paid">{activePrd.prd_id}</span>
          <div className="flex items-center gap-2 bg-paper border border-rule rounded-input px-2.5 py-1">
            <ShieldCheck className="w-3.5 h-3.5 text-success" />
            <span className="text-ink-2">Spec Completeness:</span>
            <strong className="fig font-mono text-ink">
              {completeness.done}/{completeness.total} sections
            </strong>
          </div>
          {undoStack.length > 0 && (
            <button
              type="button"
              onClick={handleUndo}
              className="cs-btn-secondary py-1 px-2.5 text-xs min-h-[32px]"
            >
              <Undo2 className="w-3.5 h-3.5" />
              <span>Undo Edit</span>
            </button>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <div className="flex items-center gap-1 p-1 stock-groove text-xs">
            {(
              [
                { id: 'preview', label: 'Live Viewer' },
                { id: 'markdown', label: 'Markdown' },
                { id: 'split', label: 'Split View' },
              ] as const
            ).map((m) => (
              <button
                key={m.id}
                type="button"
                onClick={() => setViewMode(m.id)}
                className={`px-2.5 py-1 rounded-input font-medium transition-colors ${
                  viewMode === m.id ? 'stock-card text-paid font-semibold' : 'text-ink-2 hover:text-ink'
                }`}
              >
                {m.label}
              </button>
            ))}
          </div>

          <button
            type="button"
            onClick={onCopyMarkdown}
            className="cs-btn-secondary py-1 px-2.5 text-xs min-h-[34px]"
          >
            {copiedMd ? <Check className="w-3.5 h-3.5 text-success" /> : <Copy className="w-3.5 h-3.5" />}
            <span>{copiedMd ? 'Copied' : 'Copy'}</span>
          </button>
          <button
            type="button"
            data-testid="download-prd-md-btn"
            onClick={onDownloadMarkdown}
            className="cs-btn-secondary py-1 px-2.5 text-xs min-h-[34px]"
          >
            <Download className="w-3.5 h-3.5" />
            <span>Export .md</span>
          </button>
          <button
            type="button"
            onClick={onExportLinear}
            className="cs-btn-primary py-1 px-3 text-xs min-h-[34px]"
          >
            <Send className="w-3.5 h-3.5" />
            <span>Export Linear</span>
          </button>
        </div>
      </div>

      {linearExportResult && (
        <div className="bg-success-soft border border-success rounded-stock p-3 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2 text-xs">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-success shrink-0" />
            <span className="font-semibold text-success">Linear Payload Ready:</span>
            <code className="font-mono">{linearExportResult.identifier}</code>
            <span className="text-ink-2">({linearExportResult.url})</span>
          </div>
          <code className="font-mono bg-cotton border border-success rounded-input px-2 py-0.5 text-ink">
            {linearExportResult.mutation}
          </code>
        </div>
      )}

      {/* Split Workspace: Left = AI PRD Assistant, Right = Live PRD Viewer */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-start">
        {/* LEFT PANE: AI PRD Drafting Assistant */}
        <div className="lg:col-span-5">
          <PostHogWindow
            title="AI PRD Drafting Assistant"
            path="POST /api/v1/prd/chat"
            badgeText="Live Spec Sync"
            badgeVariant="orange"
          >
            <div className="space-y-3">
              {/* Context anchor (Nielsen #6 Recognition rather than recall) */}
              <div className="bg-paper border border-rule rounded-input p-2.5 text-xs space-y-1.5">
                <div className="flex items-center justify-between gap-2">
                  <span className="font-semibold text-ink truncate">{selectedCluster.theme_title}</span>
                  <span className="fig font-mono text-paid shrink-0">
                    RICE {selectedCluster.computed_rice}
                  </span>
                </div>
                <div className="text-muted">
                  Area: <strong className="text-ink">{selectedCluster.product_area || 'Core Product'}</strong> ·{' '}
                  {selectedCluster.ticket_ids.length} verified ticket(s)
                </div>
              </div>

              {/* Optional PM Directive */}
              <div className="space-y-1">
                <label htmlFor="hitl-directive" className="text-xs font-medium text-ink-2">
                  Persistent PM Constraints (applied on full regenerate)
                </label>
                <input
                  id="hitl-directive"
                  type="text"
                  value={pmNotes}
                  onChange={(e) => onPmNotesChange(e.target.value)}
                  placeholder="e.g. Must enforce SOC2 audit log & <400ms p95..."
                  className="cs-input text-xs py-1.5 min-h-[34px]"
                />
              </div>

              {/* Quick drafting chips */}
              <div className="space-y-1">
                <div className="text-xs font-medium text-muted flex items-center gap-1">
                  <Sparkles className="w-3 h-3 text-paid" />
                  <span>1-Click PRD Actions</span>
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {QUICK_PROMPTS.map((qp) => (
                    <button
                      key={qp.label}
                      type="button"
                      disabled={isRefining}
                      onClick={() => handleSendInstruction(qp.prompt)}
                      className="text-xs bg-paper hover:bg-paper-2 border border-rule hover:border-paid text-ink px-2.5 py-1 rounded-input transition-colors"
                    >
                      {qp.label}
                    </button>
                  ))}
                </div>
              </div>

              {chatError && (
                <div className="bg-error-soft border border-error text-error rounded-input px-2.5 py-2 text-xs">
                  {chatError}
                </div>
              )}

              {/* Conversation Thread */}
              <div className="border border-rule rounded-input bg-paper p-2.5 max-h-72 overflow-y-auto space-y-2">
                {chatHistory.length === 0 ? (
                  <div className="text-xs text-muted py-4 text-center space-y-1">
                    <Bot className="w-4 h-4 mx-auto text-paid" />
                    <p>Ask me to expand sections, add Gherkin edge cases, or tailor this PRD for engineering.</p>
                  </div>
                ) : (
                  chatHistory.map((msg) => (
                    <div
                      key={msg.id}
                      className={`p-2.5 rounded-input border text-xs space-y-1.5 ${
                        msg.role === 'user' ? 'bg-paper-2 border-rule-2' : 'bg-cotton border-rule'
                      }`}
                    >
                      <div className="flex items-center justify-between gap-2 text-muted">
                        <strong className="text-ink">
                          {msg.role === 'user' ? 'You' : 'PRD Co-Pilot'}
                        </strong>
                        {msg.modelUsed && (
                          <span className="fig font-mono text-[11px] bg-paper px-1.5 py-0.5 rounded-input border border-rule">
                            {msg.modelUsed.split('/').pop()}
                            {msg.latencyMs ? ` · ${(msg.latencyMs / 1000).toFixed(1)}s` : ''}
                          </span>
                        )}
                      </div>
                      <p className="text-ink leading-relaxed">{msg.content}</p>
                      {msg.changedSections && msg.changedSections.length > 0 && (
                        <div className="flex flex-wrap gap-1 pt-0.5">
                          {msg.changedSections.map((sec) => (
                            <span
                              key={sec}
                              className="text-[11px] bg-paper-2 border border-paid text-paid px-1.5 py-0.5 rounded-input font-medium"
                            >
                              Updated: {SECTION_LABELS[sec] || sec}
                            </span>
                          ))}
                        </div>
                      )}
                    </div>
                  ))
                )}
                {isRefining && (
                  <div className="p-2.5 rounded-input border border-paid bg-cotton text-xs text-ink-2 flex items-center gap-2">
                    <RefreshCw className="w-3.5 h-3.5 animate-spin text-paid shrink-0" />
                    <span>Updating live PRD sections…</span>
                  </div>
                )}
              </div>

              {/* Instruction Form */}
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  handleSendInstruction(instruction);
                }}
                className="flex items-center gap-2"
              >
                <input
                  type="text"
                  value={instruction}
                  onChange={(e) => setInstruction(e.target.value)}
                  disabled={isRefining}
                  placeholder="Tell AI what to add, rewrite, or constrain in this PRD…"
                  className="cs-input text-xs flex-1"
                />
                <button
                  type="submit"
                  disabled={isRefining || !instruction.trim()}
                  className="cs-btn-primary text-xs px-3 shrink-0"
                >
                  <ArrowRight className="w-3.5 h-3.5" />
                  <span>Apply</span>
                </button>
              </form>
            </div>
          </PostHogWindow>
        </div>

        {/* RIGHT PANE: Live PRD Viewer + Editable Markdown */}
        <div className="lg:col-span-7 space-y-4">
          {(viewMode === 'preview' || viewMode === 'split') && (
            <PostHogWindow
              title="Live PRD Viewer"
              path={`${activePrd.prd_id}.md`}
              badgeText={
                highlightedSections.length > 0
                  ? `${highlightedSections.length} section(s) updated live`
                  : activePrd.engine_used.split('/').pop() || 'Live Spec'
              }
              badgeVariant={highlightedSections.length > 0 ? 'green' : 'yellow'}
            >
              <div className="space-y-4">
                {/* Title & Deterministic Math Metrics */}
                <div className={`p-3.5 rounded-input space-y-2.5 ${sectionHighlightClass('title')}`}>
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <h2 className="text-base sm:text-lg font-bold text-ink">
                      {activePrd.title}
                    </h2>
                    {highlightedSections.includes('title') && (
                      <span className="cs-badge-verified">Updated</span>
                    )}
                  </div>
                  <div className="flex flex-wrap items-center gap-2 text-xs fig font-mono">
                    <span className="cs-badge">RICE: {activePrd.deterministic_metrics_badge.rice}</span>
                    <span className="cs-badge">WSJF: {activePrd.deterministic_metrics_badge.wsjf}</span>
                    <span className="cs-badge">ICE: {activePrd.deterministic_metrics_badge.ice}</span>
                    <span className="cs-badge">{activePrd.deterministic_metrics_badge.moscow}</span>
                    <span className="cs-badge">Reach: {activePrd.deterministic_metrics_badge.reach}</span>
                    {activePrd.deterministic_metrics_badge.arr_impact > 0 && (
                      <span className="cs-badge-verified">
                        ARR: ${activePrd.deterministic_metrics_badge.arr_impact.toLocaleString()}
                      </span>
                    )}
                  </div>
                </div>

                {/* Executive Problem Statement + Top 3+N Citations */}
                <div className={`p-3.5 rounded-input space-y-2 ${sectionHighlightClass('executive_problem_statement')}`}>
                  <div className="flex items-center justify-between">
                    <div className="text-xs font-semibold text-ink-2">1. Executive Problem Statement</div>
                    {highlightedSections.includes('executive_problem_statement') && (
                      <span className="cs-badge-verified">Updated</span>
                    )}
                  </div>
                  <p className="text-xs sm:text-sm text-ink leading-relaxed">
                    {activePrd.executive_problem_statement}
                  </p>
                  <CitationBar
                    ticketIds={selectedCluster.ticket_ids}
                    ticketsLookup={ticketsLookup}
                    label="Supporting Customer Evidence"
                    maxVisible={3}
                  />
                </div>

                {/* Target Persona & Strategic Narrative */}
                <div
                  className={`p-3.5 rounded-input space-y-2 ${
                    highlightedSections.includes('target_persona') ||
                    highlightedSections.includes('strategic_narrative')
                      ? 'border-2 border-accent-active bg-cotton'
                      : 'border border-rule bg-cotton'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <div className="text-xs font-semibold text-ink-2">2. Target Persona &amp; Strategic Narrative</div>
                    {(highlightedSections.includes('target_persona') ||
                      highlightedSections.includes('strategic_narrative')) && (
                      <span className="cs-badge-verified">Updated</span>
                    )}
                  </div>
                  <div className="text-xs text-ink space-y-1.5 leading-relaxed">
                    <div>
                      <strong className="text-ink-2">Persona:</strong> {activePrd.target_persona}
                    </div>
                    <div>
                      <strong className="text-ink-2">Strategic Narrative:</strong> {activePrd.strategic_narrative}
                    </div>
                  </div>
                </div>

                {/* Gherkin Scenarios */}
                <div className={`p-3.5 rounded-input space-y-2.5 ${sectionHighlightClass('user_stories')}`}>
                  <div className="flex items-center justify-between">
                    <div className="text-xs font-semibold text-ink-2 flex items-center gap-1.5">
                      <FileCode2 className="w-3.5 h-3.5 text-paid" />
                      <span>3. Gherkin Acceptance Criteria ({activePrd.user_stories.length})</span>
                    </div>
                    {highlightedSections.includes('user_stories') && (
                      <span className="cs-badge-verified">Updated</span>
                    )}
                  </div>
                  <div className="space-y-2">
                    {activePrd.user_stories.map((story) => (
                      <div
                        key={story.scenario_id}
                        className="bg-board text-board-type p-3 rounded-input font-mono text-xs space-y-1"
                      >
                        <div className="text-accent font-semibold">
                          {story.scenario_id}: {story.title}
                        </div>
                        <div><strong>Given</strong> {story.given}</div>
                        <div><strong>When</strong> {story.when}</div>
                        <div><strong>Then</strong> {story.then}</div>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Edge Cases + Telemetry + Rollout */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <div className={`p-3 rounded-input space-y-2 ${sectionHighlightClass('defensive_edge_cases')}`}>
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-semibold text-ink-2">4. Defensive Edge Cases</span>
                      {highlightedSections.includes('defensive_edge_cases') && (
                        <span className="cs-badge-verified">Updated</span>
                      )}
                    </div>
                    <ul className="space-y-1.5 text-xs text-ink list-disc pl-4">
                      {activePrd.defensive_edge_cases.map((edge, i) => (
                        <li key={i} className="leading-relaxed">{edge}</li>
                      ))}
                    </ul>
                  </div>

                  <div className={`p-3 rounded-input space-y-2 ${sectionHighlightClass('telemetry_events')}`}>
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-semibold text-ink-2">5. Telemetry &amp; KPIs</span>
                      {highlightedSections.includes('telemetry_events') && (
                        <span className="cs-badge-verified">Updated</span>
                      )}
                    </div>
                    <div className="space-y-2 text-xs">
                      {activePrd.telemetry_events.map((ev, i) => (
                        <div key={i} className="bg-paper border border-rule rounded-input p-2 space-y-0.5">
                          <div className="font-mono font-semibold text-paid">{ev.event_name}</div>
                          <div className="text-muted">Props: {ev.properties.join(', ')}</div>
                          <div className="text-ink">SLA: {ev.success_threshold}</div>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>

                <div className={`p-3 rounded-input space-y-2 ${sectionHighlightClass('rollout_plan')}`}>
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-semibold text-ink-2">6. Phased Rollout Plan</span>
                    {highlightedSections.includes('rollout_plan') && (
                      <span className="cs-badge-verified">Updated</span>
                    )}
                  </div>
                  <ol className="space-y-1 text-xs text-ink list-decimal pl-4">
                    {activePrd.rollout_plan.map((step, i) => (
                      <li key={i} className="leading-relaxed">{step}</li>
                    ))}
                  </ol>
                </div>
              </div>
            </PostHogWindow>
          )}

          {(viewMode === 'markdown' || viewMode === 'split') && (
            <PostHogWindow
              title="Direct HITL Markdown Editor"
              badgeText={`${editableMarkdown.length} chars`}
              badgeVariant="orange"
            >
              <div className="space-y-2">
                <textarea
                  aria-label="HITL Editable PRD Markdown"
                  rows={viewMode === 'split' ? 14 : 24}
                  value={editableMarkdown}
                  onChange={(e) => onEditableMarkdownChange(e.target.value)}
                  className="w-full bg-paper border border-rule rounded-input p-3 font-mono text-xs leading-relaxed focus:outline-none focus:border-paid"
                />
                <div className="flex items-center justify-between text-xs text-muted">
                  <span>Manual Markdown edits persist automatically to workspace memory</span>
                  <span className="fig font-mono">{editableMarkdown.split('\n').length} lines</span>
                </div>
              </div>
            </PostHogWindow>
          )}
        </div>
      </div>
    </div>
  );
};
