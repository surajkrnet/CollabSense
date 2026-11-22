import React, { useMemo, useState } from 'react';
import {
  ActivitySquare,
  AlertTriangle,
  ArrowRight,
  CheckCircle2,
  Download,
  Flag,
  Plus,
  RefreshCw,
  Sparkles,
  TrendingDown,
  TrendingUp,
} from 'lucide-react';
import { RawTicket } from '../lib/calculators';
import { EnrichedTicket, ReleaseValidationItem } from '../lib/projects';
import { CitationBar } from './CitationBar';
import { PostHogWindow } from './PostHogWindow';

interface ReleaseAnalyticsViewProps {
  validations: ReleaseValidationItem[];
  tickets: RawTicket[];
  enrichedTickets: EnrichedTicket[];
  ticketsLookup: Map<string, RawTicket>;
  validatingClusterId: string | null;
  onUpdateField: (
    clusterId: string,
    field: 'release_tag' | 'post_release_daily_tickets' | 'feature_flag' | 'rollout_pct' | 'verdict',
    value: string | number
  ) => void;
  onAddMonitor: (item: ReleaseValidationItem) => void;
  onValidateWithAi: (rv: ReleaseValidationItem, thresholdPct: number, cohortWindow: string) => void;
  onGoToUpload: () => void;
  onRunClustering: () => void;
  onGoToClosure: () => void;
}

export const ReleaseAnalyticsView: React.FC<ReleaseAnalyticsViewProps> = ({
  validations,
  tickets,
  enrichedTickets,
  ticketsLookup,
  validatingClusterId,
  onUpdateField,
  onAddMonitor,
  onValidateWithAi,
  onGoToUpload,
  onRunClustering,
  onGoToClosure,
}) => {
  const [statusFilter, setStatusFilter] = useState<'ALL' | 'VERIFIED_RESOLVED' | 'MONITORING' | 'REGRESSION_SPIKE'>('ALL');
  const [cohortWindow, setCohortWindow] = useState<'24h Canary' | '7d Post-Release' | '14d Soak' | '30d GA'>('7d Post-Release');
  const [spikeThresholdPct, setSpikeThresholdPct] = useState<number>(15);
  const [showAddForm, setShowAddForm] = useState(false);
  const [newTitle, setNewTitle] = useState('');
  const [newTag, setNewTag] = useState('v1.1.0-canary');
  const [newPreRate, setNewPreRate] = useState('3.0');
  const [newPostRate, setNewPostRate] = useState('0.8');

  const signalPool = useMemo(() => {
    const sigs = enrichedTickets.filter((t) => !t.is_noise);
    return sigs.length > 0 ? sigs : tickets;
  }, [enrichedTickets, tickets]);

  const kpis = useMemo(() => {
    const count = validations.length;
    const avgDelta =
      count > 0
        ? validations.reduce((acc, r) => acc + r.delta_pct, 0) / count
        : 0;
    const resolvedCount = validations.filter((r) => r.verdict === 'VERIFIED_RESOLVED').length;
    const activeSpikes = validations.filter(
      (r) => r.delta_pct > spikeThresholdPct || r.spike_detected
    ).length;
    const monitoredTickets = Array.from(
      new Set(validations.flatMap((r) => r.citations))
    );
    const totalArr = monitoredTickets.reduce(
      (acc, tid) => acc + (ticketsLookup.get(tid)?.arr_weight || 0),
      0
    );
    return {
      count,
      avgDelta: Number(avgDelta.toFixed(1)),
      resolvedCount,
      resolvedPct: count > 0 ? Math.round((resolvedCount / count) * 100) : 0,
      activeSpikes,
      monitoredReach: monitoredTickets.length,
      totalArr,
    };
  }, [validations, spikeThresholdPct, ticketsLookup]);

  const channelBreakdown = useMemo(() => {
    const map = new Map<string, number>();
    signalPool.forEach((t) => {
      const ch = t.source || 'CSV';
      map.set(ch, (map.get(ch) || 0) + 1);
    });
    const total = Math.max(signalPool.length, 1);
    return Array.from(map.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 6)
      .map(([name, cnt]) => ({ name, count: cnt, pct: Math.round((cnt / total) * 100) }));
  }, [signalPool]);

  const tierBreakdown = useMemo(() => {
    const map = new Map<string, number>();
    signalPool.forEach((t) => {
      const tr = t.customer_tier || 'Standard';
      map.set(tr, (map.get(tr) || 0) + 1);
    });
    const total = Math.max(signalPool.length, 1);
    return Array.from(map.entries())
      .sort((a, b) => b[1] - a[1])
      .map(([name, cnt]) => ({ name, count: cnt, pct: Math.round((cnt / total) * 100) }));
  }, [signalPool]);

  const filteredValidations = useMemo(() => {
    if (statusFilter === 'ALL') return validations;
    return validations.filter((v) => v.verdict === statusFilter);
  }, [validations, statusFilter]);

  const maxBarRate = useMemo(() => {
    const maxVal = validations.reduce(
      (m, v) => Math.max(m, v.pre_release_daily_tickets, v.post_release_daily_tickets),
      1
    );
    return Math.max(maxVal, 1);
  }, [validations]);

  const handleExportReport = () => {
    const lines = [
      `# Release Validation & Telemetry Report (${cohortWindow})`,
      `Spike Alert Threshold: +${spikeThresholdPct}%`,
      `Monitors: ${kpis.count} | Verified Resolved: ${kpis.resolvedCount} (${kpis.resolvedPct}%) | Active Spikes: ${kpis.activeSpikes}`,
      '',
      ...validations.map(
        (v) =>
          `## ${v.cluster_id} — ${v.theme_title} (${v.release_tag})\n` +
          `- Verdict: **${v.verdict}** | Pre: ${v.pre_release_daily_tickets}/day -> Post: ${v.post_release_daily_tickets}/day (${v.delta_pct > 0 ? '+' : ''}${v.delta_pct}%)\n` +
          `- Feature Flag: \`${v.feature_flag || 'unassigned'}\` (${v.rollout_pct ?? 100}% rollout)\n` +
          `- Citations: ${v.citations.join(', ')}\n` +
          `- Summary: ${v.regression_summary}\n`
      ),
    ];
    const blob = new Blob([lines.join('\n')], { type: 'text/markdown;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `release-analytics-${cohortWindow.toLowerCase().replace(/[^a-z0-9]+/g, '-')}.md`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const handleCreateCustomMonitor = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTitle.trim()) return;
    const pre = Math.max(0.1, Number(newPreRate) || 1.0);
    const post = Math.max(0, Number(newPostRate) || 0);
    const delta = Number((((post - pre) / pre) * 100).toFixed(1));
    const spike = delta > spikeThresholdPct;
    const nextNum = validations.length + 1;
    onAddMonitor({
      cluster_id: nextNum < 10 ? `MON-0${nextNum}` : `MON-${nextNum}`,
      theme_title: newTitle.trim(),
      release_tag: newTag.trim() || 'v1.0.0',
      pre_release_daily_tickets: pre,
      post_release_daily_tickets: post,
      delta_pct: delta,
      spike_detected: spike,
      verdict: spike ? 'REGRESSION_SPIKE' : post <= pre * 0.65 ? 'VERIFIED_RESOLVED' : 'MONITORING',
      regression_summary: `Custom release monitor created for ${cohortWindow} (${delta > 0 ? '+' : ''}${delta}% change).`,
      citations: signalPool.slice(0, 3).map((t) => t.id),
      feature_flag: `ff_custom_${nextNum}`,
      rollout_pct: 25,
      cohort_window: cohortWindow,
    });
    setNewTitle('');
    setShowAddForm(false);
  };

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-ink">
            Stage 7: Release Validation &amp; Post-Launch Analytics Board
          </h1>
          <p className="text-xs sm:text-sm text-ink-2 mt-1">
            Monitor complaint volume shifts, staged feature-flag rollouts, segment telemetry, and regression alerts.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => setShowAddForm((v) => !v)}
            className="cs-btn-secondary text-xs whitespace-nowrap"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>Add Release Monitor</span>
          </button>
          <button
            type="button"
            onClick={handleExportReport}
            disabled={validations.length === 0}
            className="cs-btn-secondary text-xs whitespace-nowrap"
          >
            <Download className="w-3.5 h-3.5" />
            <span>Export Report</span>
          </button>
          <button
            type="button"
            onClick={onGoToClosure}
            className="cs-btn-primary text-xs whitespace-nowrap"
          >
            <span>Stage 8: Loop Closure</span>
            <ArrowRight className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* KPI Summary Strip */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3.5">
        <div className="cs-card p-4 space-y-1">
          <div className="text-xs text-muted">Avg Complaint Delta</div>
          <div className="flex items-center gap-2">
            {kpis.avgDelta <= 0 ? (
              <TrendingDown className="w-4 h-4 text-success" />
            ) : (
              <TrendingUp className="w-4 h-4 text-error" />
            )}
            <span
              className={`fig font-mono text-2xl font-bold ${
                kpis.avgDelta <= 0 ? 'text-success' : 'text-error'
              }`}
            >
              {kpis.avgDelta > 0 ? '+' : ''}
              {kpis.avgDelta}%
            </span>
          </div>
          <div className="text-xs text-ink-2">Window: {cohortWindow}</div>
        </div>

        <div className="cs-card p-4 space-y-1">
          <div className="text-xs text-muted">Verified Resolution Rate</div>
          <div className="fig font-mono text-2xl font-bold text-ink">
            {kpis.resolvedPct}%
          </div>
          <div className="text-xs text-ink-2">
            {kpis.resolvedCount} of {kpis.count} release tracks verified
          </div>
        </div>

        <div className="cs-card p-4 space-y-1">
          <div className="text-xs text-muted">Regression Alerts (&gt;+{spikeThresholdPct}%)</div>
          <div
            className={`fig font-mono text-2xl font-bold ${
              kpis.activeSpikes > 0 ? 'text-error' : 'text-success'
            }`}
          >
            {kpis.activeSpikes}
          </div>
          <div className="text-xs text-ink-2">
            {kpis.activeSpikes > 0 ? 'Rollback review recommended' : 'Zero active spikes'}
          </div>
        </div>

        <div className="cs-card p-4 space-y-1">
          <div className="text-xs text-muted">Monitored Citations</div>
          <div className="fig font-mono text-2xl font-bold text-ink">
            {kpis.monitoredReach}
          </div>
          <div className="text-xs text-ink-2">
            {kpis.totalArr > 0
              ? `$${Math.round(kpis.totalArr / 1000).toLocaleString()}k ARR covered`
              : `${signalPool.length} active signal tickets`}
          </div>
        </div>
      </div>

      {/* Add Custom Monitor Drawer */}
      {showAddForm && (
        <form onSubmit={handleCreateCustomMonitor} className="cs-card p-4 space-y-3 cs-panel-enter">
          <div className="text-xs font-semibold text-ink">Create Custom Release Telemetry Monitor</div>
          <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
            <input
              type="text"
              required
              placeholder="Feature / Release name…"
              value={newTitle}
              onChange={(e) => setNewTitle(e.target.value)}
              className="cs-input text-xs sm:col-span-2"
            />
            <input
              type="text"
              placeholder="Release tag (e.g. v1.4.0)"
              value={newTag}
              onChange={(e) => setNewTag(e.target.value)}
              className="cs-input text-xs font-mono"
            />
            <div className="flex items-center gap-2">
              <input
                type="number"
                step="0.1"
                min="0.1"
                value={newPreRate}
                onChange={(e) => setNewPreRate(e.target.value)}
                title="Pre-release tickets/day"
                className="cs-input text-xs font-mono"
              />
              <span className="text-xs text-muted">→</span>
              <input
                type="number"
                step="0.1"
                min="0"
                value={newPostRate}
                onChange={(e) => setNewPostRate(e.target.value)}
                title="Post-release tickets/day"
                className="cs-input text-xs font-mono"
              />
            </div>
          </div>
          <div className="flex justify-end gap-2">
            <button type="button" onClick={() => setShowAddForm(false)} className="cs-btn-secondary text-xs">
              Cancel
            </button>
            <button type="submit" className="cs-btn-primary text-xs">
              Add Monitor
            </button>
          </div>
        </form>
      )}

      {/* Analytics Charts Row */}
      {validations.length > 0 && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
          <div className="lg:col-span-7">
            <PostHogWindow
              title="Pre-Release vs. Post-Release Daily Ticket Volume"
              badgeText={cohortWindow}
              badgeVariant="orange"
            >
              <div className="space-y-3">
                {validations.map((rv) => {
                  const preW = Math.max(4, Math.round((rv.pre_release_daily_tickets / maxBarRate) * 100));
                  const postW = Math.max(2, Math.round((rv.post_release_daily_tickets / maxBarRate) * 100));
                  const isSpike = rv.delta_pct > spikeThresholdPct || rv.spike_detected;
                  return (
                    <div key={rv.cluster_id} className="space-y-1 text-xs">
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-medium text-ink truncate">
                          <span className="font-mono text-paid mr-1.5">{rv.cluster_id}</span>
                          {rv.theme_title}
                        </span>
                        <span
                          className={`fig font-mono font-semibold shrink-0 ${
                            isSpike ? 'text-error' : rv.delta_pct < 0 ? 'text-success' : 'text-ink-2'
                          }`}
                        >
                          {rv.delta_pct > 0 ? '+' : ''}
                          {rv.delta_pct}%
                        </span>
                      </div>
                      <div className="space-y-1">
                        <div className="flex items-center gap-2">
                          <span className="w-10 text-[11px] text-muted font-mono">Pre</span>
                          <div className="flex-1 bg-paper-2 rounded-input h-2.5 overflow-hidden">
                            <div
                              className="bg-ink-2 h-full rounded-input transition-all"
                              style={{ width: `${preW}%` }}
                            />
                          </div>
                          <span className="w-12 text-right font-mono text-[11px] text-ink-2">
                            {rv.pre_release_daily_tickets}/d
                          </span>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="w-10 text-[11px] text-muted font-mono">Post</span>
                          <div className="flex-1 bg-paper-2 rounded-input h-2.5 overflow-hidden">
                            <div
                              className={`h-full rounded-input transition-all ${
                                isSpike ? 'bg-error' : 'bg-success'
                              }`}
                              style={{ width: `${postW}%` }}
                            />
                          </div>
                          <span className="w-12 text-right font-mono text-[11px] font-semibold text-ink">
                            {rv.post_release_daily_tickets}/d
                          </span>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </PostHogWindow>
          </div>

          <div className="lg:col-span-5">
            <PostHogWindow
              title="Signal Segment & Channel Mix"
              badgeText={`${signalPool.length} signals`}
              badgeVariant="green"
            >
              <div className="space-y-4 text-xs">
                <div className="space-y-1.5">
                  <div className="font-semibold text-ink-2">By Ingestion Channel</div>
                  {channelBreakdown.length === 0 ? (
                    <div className="text-muted">Upload feedback to populate channel metrics.</div>
                  ) : (
                    channelBreakdown.map((ch) => (
                      <div key={ch.name} className="flex items-center gap-2">
                        <span className="w-20 truncate text-ink">{ch.name}</span>
                        <div className="flex-1 bg-paper-2 rounded-input h-2 overflow-hidden">
                          <div className="bg-paid h-full rounded-input" style={{ width: `${ch.pct}%` }} />
                        </div>
                        <span className="w-14 text-right font-mono text-muted">
                          {ch.count} ({ch.pct}%)
                        </span>
                      </div>
                    ))
                  )}
                </div>

                <div className="pt-3 border-t border-rule space-y-1.5">
                  <div className="font-semibold text-ink-2">By Customer Tier</div>
                  {tierBreakdown.length === 0 ? (
                    <div className="text-muted">No customer tier metadata yet.</div>
                  ) : (
                    tierBreakdown.map((tr) => (
                      <div key={tr.name} className="flex items-center gap-2">
                        <span className="w-20 truncate text-ink">{tr.name}</span>
                        <div className="flex-1 bg-paper-2 rounded-input h-2 overflow-hidden">
                          <div className="bg-ink h-full rounded-input" style={{ width: `${tr.pct}%` }} />
                        </div>
                        <span className="w-14 text-right font-mono text-muted">
                          {tr.count} ({tr.pct}%)
                        </span>
                      </div>
                    ))
                  )}
                </div>
              </div>
            </PostHogWindow>
          </div>
        </div>
      )}

      {/* Analytics Filter & Threshold Controls */}
      <div className="cs-card p-3 flex flex-wrap items-center justify-between gap-3 text-xs">
        <div className="flex flex-wrap items-center gap-1.5">
          {(
            [
              { id: 'ALL', label: 'All Tracks' },
              { id: 'VERIFIED_RESOLVED', label: 'Verified Resolved' },
              { id: 'MONITORING', label: 'Monitoring' },
              { id: 'REGRESSION_SPIKE', label: 'Regression Spikes' },
            ] as const
          ).map((f) => (
            <button
              key={f.id}
              type="button"
              onClick={() => setStatusFilter(f.id)}
              className={`px-2.5 py-1 rounded-input border font-medium ${
                statusFilter === f.id
                  ? 'bg-paper-2 border-paid text-paid font-semibold'
                  : 'bg-cotton border-rule text-muted hover:text-ink'
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <label className="flex items-center gap-1.5 text-ink-2">
            <span>Window:</span>
            <select
              value={cohortWindow}
              onChange={(e) => setCohortWindow(e.target.value as typeof cohortWindow)}
              className="bg-paper border border-rule rounded-input px-2 py-1 text-xs text-ink"
            >
              <option value="24h Canary">24h Canary</option>
              <option value="7d Post-Release">7d Post-Release</option>
              <option value="14d Soak">14d Soak</option>
              <option value="30d GA">30d GA</option>
            </select>
          </label>

          <label className="flex items-center gap-1.5 text-ink-2">
            <span>Spike Alert:</span>
            <select
              value={spikeThresholdPct}
              onChange={(e) => setSpikeThresholdPct(Number(e.target.value))}
              className="bg-paper border border-rule rounded-input px-2 py-1 text-xs font-mono text-ink"
            >
              <option value={5}>&gt; +5%</option>
              <option value={10}>&gt; +10%</option>
              <option value={15}>&gt; +15%</option>
              <option value={25}>&gt; +25%</option>
            </select>
          </label>
        </div>
      </div>

      {/* Monitors List */}
      {validations.length === 0 ? (
        <div className="cs-card p-6 text-center space-y-3">
          <ActivitySquare className="w-6 h-6 mx-auto text-paid" />
          <p className="text-sm font-semibold text-ink">No release monitors tracked yet</p>
          <p className="text-xs text-ink-2">
            Run clustering on uploaded feedback or add a custom release monitor above.
          </p>
          <button
            type="button"
            onClick={tickets.length === 0 ? onGoToUpload : onRunClustering}
            className="cs-btn-primary text-xs"
          >
            {tickets.length === 0 ? 'Go to Stage 1: Upload Data' : 'Generate Clusters & Monitors'}
          </button>
        </div>
      ) : (
        <div className="space-y-3.5">
          {filteredValidations.map((rv) => {
            const isSpike = rv.delta_pct > spikeThresholdPct || rv.spike_detected;
            const rolloutPct = rv.rollout_pct ?? 100;
            return (
              <div
                key={rv.cluster_id}
                className={`p-4 sm:p-5 rounded-stock border space-y-3.5 ${
                  isSpike ? 'bg-error-soft border-error' : 'stock-card border-rule'
                }`}
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex flex-wrap items-center gap-2 min-w-0">
                    <span className="fig font-mono text-xs font-semibold text-paid">
                      {rv.cluster_id}
                    </span>
                    <input
                      type="text"
                      aria-label={`Release tag for ${rv.cluster_id}`}
                      value={rv.release_tag}
                      onChange={(e) => onUpdateField(rv.cluster_id, 'release_tag', e.target.value)}
                      className="fig font-mono text-xs bg-paper border border-rule px-2 py-0.5 rounded-input w-32 focus:outline-none focus:border-paid"
                    />
                    <h3 className="font-semibold text-sm sm:text-base text-ink truncate">
                      {rv.theme_title}
                    </h3>
                  </div>

                  <div className="flex flex-wrap items-center gap-2">
                    {isSpike ? (
                      <span className="cs-badge-p0">
                        Regression spike (+{rv.delta_pct}%)
                      </span>
                    ) : rv.verdict === 'MONITORING' ? (
                      <span className="cs-badge-p2">
                        Monitoring ({rv.delta_pct > 0 ? '+' : ''}
                        {rv.delta_pct}%)
                      </span>
                    ) : (
                      <span className="cs-badge-verified">
                        Verified resolved ({rv.delta_pct}%)
                      </span>
                    )}

                    <button
                      type="button"
                      onClick={() => onUpdateField(rv.cluster_id, 'verdict', 'VERIFIED_RESOLVED')}
                      className="cs-btn-secondary text-xs py-1 px-2.5 min-h-[32px]"
                      title="Mark fix verified"
                    >
                      <CheckCircle2 className="w-3.5 h-3.5 text-success" />
                      <span>Verify</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => onUpdateField(rv.cluster_id, 'verdict', 'REGRESSION_SPIKE')}
                      className="cs-btn-secondary text-xs py-1 px-2.5 min-h-[32px]"
                      title="Flag rollback risk"
                    >
                      <AlertTriangle className="w-3.5 h-3.5 text-error" />
                      <span>Rollback</span>
                    </button>

                    <button
                      type="button"
                      data-testid={`validate-release-${rv.cluster_id}`}
                      disabled={validatingClusterId === rv.cluster_id}
                      onClick={() => onValidateWithAi(rv, spikeThresholdPct, cohortWindow)}
                      className="cs-btn-primary text-xs py-1 px-3 min-h-[32px]"
                    >
                      {validatingClusterId === rv.cluster_id ? (
                        <RefreshCw className="w-3 h-3 animate-spin" />
                      ) : (
                        <Sparkles className="w-3 h-3" />
                      )}
                      <span>
                        {validatingClusterId === rv.cluster_id ? 'Validating…' : 'Validate with AI'}
                      </span>
                    </button>
                  </div>
                </div>

                <p className="text-xs text-ink-2 leading-relaxed">{rv.regression_summary}</p>

                {/* Metrics & Feature Flag Controls */}
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 text-xs">
                  <div className="bg-paper border border-rule rounded-input p-3">
                    <div className="text-muted">Pre-release volume</div>
                    <div className="fig font-mono text-base font-semibold text-ink mt-1">
                      {rv.pre_release_daily_tickets} / day
                    </div>
                  </div>

                  <div className="bg-paper border border-rule rounded-input p-3">
                    <label htmlFor={`post-rate-${rv.cluster_id}`} className="text-muted block">
                      Post-release volume
                    </label>
                    <div className="flex items-center gap-1.5 mt-1">
                      <input
                        id={`post-rate-${rv.cluster_id}`}
                        type="number"
                        min={0}
                        step="0.1"
                        value={rv.post_release_daily_tickets}
                        onChange={(e) =>
                          onUpdateField(rv.cluster_id, 'post_release_daily_tickets', e.target.value)
                        }
                        className="fig font-mono text-sm font-semibold text-ink bg-cotton border border-rule rounded-input px-2 py-0.5 w-20 focus:outline-none focus:border-paid"
                      />
                      <span className="font-mono text-muted">/ day</span>
                    </div>
                  </div>

                  <div className="bg-paper border border-rule rounded-input p-3 space-y-1">
                    <div className="flex items-center gap-1 text-muted">
                      <Flag className="w-3 h-3 text-paid" />
                      <span>Feature Flag</span>
                    </div>
                    <input
                      type="text"
                      value={rv.feature_flag || `ff_${rv.cluster_id.toLowerCase()}`}
                      onChange={(e) => onUpdateField(rv.cluster_id, 'feature_flag', e.target.value)}
                      className="font-mono text-xs bg-cotton border border-rule rounded-input px-2 py-0.5 w-full focus:outline-none focus:border-paid"
                    />
                  </div>

                  <div className="bg-paper border border-rule rounded-input p-3 space-y-1.5">
                    <div className="flex items-center justify-between text-muted">
                      <span>Flag Rollout</span>
                      <span className="fig font-mono font-semibold text-ink">{rolloutPct}%</span>
                    </div>
                    <div className="flex items-center gap-1">
                      {[10, 25, 50, 100].map((pct) => (
                        <button
                          key={pct}
                          type="button"
                          onClick={() => onUpdateField(rv.cluster_id, 'rollout_pct', pct)}
                          className={`flex-1 font-mono text-[11px] py-0.5 rounded-input border ${
                            rolloutPct === pct
                              ? 'bg-board text-board-type border-ink font-semibold'
                              : 'bg-cotton border-rule text-muted hover:text-ink'
                          }`}
                        >
                          {pct}%
                        </button>
                      ))}
                    </div>
                  </div>
                </div>

                <CitationBar
                  ticketIds={rv.citations}
                  ticketsLookup={ticketsLookup}
                  label="Monitored customer evidence"
                  maxVisible={3}
                />
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};
