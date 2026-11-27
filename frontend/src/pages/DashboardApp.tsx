import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import {
  Home,
  Upload,
  Activity,
  Users,
  Filter,
  Layers,
  AlertOctagon,
  Calculator,
  FileCode2,
  ActivitySquare,
  CheckCircle2,
  Sparkles,
  LogOut,
  RefreshCw,
  Terminal,
  ArrowRight,
  ArrowLeft,
  PanelLeftClose,
  PanelLeftOpen,
  Search,
  ChevronDown,
  ChevronUp,
  FolderPlus,
  X,
  Target,
  UserPlus,
  MessageSquare,
  SlidersHorizontal,
  ShieldCheck,
  Check,
} from 'lucide-react';
import { PostHogWindow } from '../components/PostHogWindow';
import { PostHogBrandMark } from '../components/PostHogDesktopShell';
import { IngestionModal } from '../components/IngestionModal';
import { CitationBar, getSeverityStyle, sortBySeverityHierarchy } from '../components/CitationBar';
import { PRDStudioView } from '../components/PRDStudioView';
import { ReleaseAnalyticsView } from '../components/ReleaseAnalyticsView';
import { LoopClosureView } from '../components/LoopClosureView';
import { CsvParseDiagnostics, parseCsvToTickets } from '../lib/csvParser';
import {
  GeneratedPRD,
  PrioritizationFramework,
  RawTicket,
  SeverityLevel,
  recalculateAndSortClusters,
} from '../lib/calculators';
import { buildLocalPRD } from '../lib/sampleData';
import { CollabSenseUser, clearSessionUser, getAccessToken } from '../lib/supabase';
import {
  ActivityLogEntry,
  ChatMessageItem,
  CollabSenseProject,
  EnrichedTicket,
  LoopClosureDraftItem,
  PRDChatMessage,
  ReleaseValidationItem,
  TriageCluster,
  buildDownstreamStagesFromClusters,
  enrichTicketDeterministically,
  fetchProjectWorkspaceFromSupabase,
  fetchProjectsFromSupabase,
  getActiveProjectId,
  getSavedProjects,
  hydrateTriageClusters,
  inviteMemberToSupabase,
  loadProjectWorkspaceData,
  logActivityToSupabase,
  saveChatMessageToSupabase,
  saveProjectWorkspaceData,
  saveTriageReviewToSupabase,
  setActiveProjectId,
} from '../lib/projects';

const API_BASE = (
  import.meta.env.VITE_API_BASE_URL ?? (import.meta.env.PROD ? '' : 'http://localhost:8000')
).replace(/\/+$/, '');

export type WorkspaceViewId =
  | 'home'
  | 'upload'
  | 'activity'
  | 'collab'
  | 'noise'
  | 'intent'
  | 'triage'
  | 'prioritization'
  | 'prd'
  | 'validation'
  | 'closure';

const LEGACY_MODULE_TO_VIEW: Record<string, WorkspaceViewId> = {
  MOD_1_INGEST: 'upload',
  MOD_2_MATRIX: 'prioritization',
  MOD_3_PRD: 'prd',
  MOD_4_ECON: 'validation',
  MOD_5_GROWTH: 'closure',
  MOD_6_EVALS: 'triage',
};

interface DashboardAppProps {
  user: CollabSenseUser;
}

export const DashboardApp: React.FC<DashboardAppProps> = ({ user }) => {
  const navigate = useNavigate();
  const params = useParams<{ projectId?: string; view?: string }>();
  const [searchParams, setSearchParams] = useSearchParams();
  const mainScrollRef = useRef<HTMLElement | null>(null);

  const [projects, setProjects] = useState<CollabSenseProject[]>(() => getSavedProjects());
  const [projectsSynced, setProjectsSynced] = useState(false);

  useEffect(() => {
    let mounted = true;
    fetchProjectsFromSupabase(user.email).then(({ projects: synced }) => {
      if (!mounted) return;
      setProjects(synced);
      setProjectsSynced(true);
    });
    return () => {
      mounted = false;
    };
  }, [user.email]);

  const resolvedProjectId =
    params.projectId && projects.some((p) => p.id === params.projectId)
      ? params.projectId
      : getActiveProjectId();
  const activeProject: CollabSenseProject =
    projects.find((p) => p.id === resolvedProjectId) ||
    projects[0] || {
      id: resolvedProjectId || 'new',
      name: 'New Project',
      description: '',
      okr_focus: '',
      createdAt: new Date().toISOString(),
      ownerEmail: user.email,
    };

  useEffect(() => {
    if (projectsSynced && projects.length === 0) {
      navigate('/projects', { replace: true });
    }
  }, [projectsSynced, projects.length, navigate]);

  const [switcherOpen, setSwitcherOpen] = useState(false);

  const resolveInitialView = (): WorkspaceViewId => {
    const modParam = searchParams.get('module');
    if (modParam && LEGACY_MODULE_TO_VIEW[modParam]) {
      return LEGACY_MODULE_TO_VIEW[modParam];
    }
    const v = params.view as WorkspaceViewId | undefined;
    const validViews: WorkspaceViewId[] = [
      'home',
      'upload',
      'activity',
      'collab',
      'noise',
      'intent',
      'triage',
      'prioritization',
      'prd',
      'validation',
      'closure',
    ];
    if (v && validViews.includes(v)) return v;
    return 'home';
  };

  const [activeView, setActiveView] = useState<WorkspaceViewId>(resolveInitialView);

  useEffect(() => {
    const modParam = searchParams.get('module');
    if (modParam && LEGACY_MODULE_TO_VIEW[modParam]) {
      setActiveView(LEGACY_MODULE_TO_VIEW[modParam]);
      return;
    }
    if (params.view && params.view !== activeView) {
      setActiveView(params.view as WorkspaceViewId);
    }
  }, [params.view, searchParams]);

  const [workspace, setWorkspace] = useState(() =>
    loadProjectWorkspaceData(activeProject.id)
  );

  useEffect(() => {
    setActiveProjectId(activeProject.id);
    const loaded = loadProjectWorkspaceData(activeProject.id);
    setWorkspace(loaded);
    let mounted = true;
    fetchProjectWorkspaceFromSupabase(activeProject).then((remoteWs) => {
      if (mounted) {
        setWorkspace(remoteWs);
      }
    });
    return () => {
      mounted = false;
    };
  }, [activeProject.id]);

  const getAuthHeaders = async (): Promise<Record<string, string>> => {
    const token = await getAccessToken();
    return token
      ? { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }
      : { 'Content-Type': 'application/json' };
  };

  const updateWorkspace = (updater: (prev: typeof workspace) => typeof workspace) => {
    setWorkspace((prev) => {
      const next = updater(prev);
      saveProjectWorkspaceData(activeProject.id, next);
      return next;
    });
  };

  const appendActivity = (
    stage: string,
    action: string,
    detail: string,
    citations: string[] = []
  ) => {
    const entry: ActivityLogEntry = {
      id: `ACT-${Date.now().toString().slice(-4)}`,
      timestamp: new Date().toISOString(),
      actor: user.email,
      stage,
      action,
      detail,
      citations,
    };
    updateWorkspace((prev) => ({
      ...prev,
      activityLog: [entry, ...prev.activityLog],
    }));
    void logActivityToSupabase(activeProject.id, entry);
  };

  const selectView = (view: WorkspaceViewId) => {
    setActiveView(view);
    setSearchParams({}, { replace: true });
    navigate(`/app/${activeProject.id}/${view}`, { replace: true });
    if (mainScrollRef.current) {
      mainScrollRef.current.scrollTo({ top: 0, behavior: 'smooth' });
    }
  };

  const handleSwitchProject = (nextProjectId: string) => {
    setSwitcherOpen(false);
    setActiveProjectId(nextProjectId);
    navigate(`/app/${nextProjectId}/${activeView}`);
  };

  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [sidebarSearch, setSidebarSearch] = useState('');
  const [sourceFilter, setSourceFilter] = useState<string>('ALL');
  const [uploadPage, setUploadPage] = useState<number>(1);
  const [lastIngestDiagnostics, setLastIngestDiagnostics] = useState<CsvParseDiagnostics | null>(null);

  const [noiseFilterMode, setNoiseFilterMode] = useState<'ALL' | 'SIGNAL' | 'NOISE'>('ALL');
  const [noiseCategoryFilter, setNoiseCategoryFilter] = useState<string>('ALL');
  const [noiseSearch, setNoiseSearch] = useState<string>('');
  const [noisePage, setNoisePage] = useState<number>(1);

  const [intentFilter, setIntentFilter] = useState<string>('ALL');
  const [severityFilter, setSeverityFilter] = useState<string>('ALL');
  const [intentSortMode, setIntentSortMode] = useState<'severity' | 'reach' | 'arr'>('severity');
  const [triageFilter, setTriageFilter] = useState<'ALL' | 'PENDING' | 'APPROVED' | 'REJECTED'>('ALL');
  const [quickWinsOnly, setQuickWinsOnly] = useState<boolean>(false);
  const [expandedWeightsIds, setExpandedWeightsIds] = useState<Record<string, boolean>>({});

  const [isIngestModalOpen, setIsIngestModalOpen] = useState(false);
  const [isRunningStage, setIsRunningStage] = useState(false);
  const [stageProgressMsg, setStageProgressMsg] = useState<string | null>(null);
  const [stageError, setStageError] = useState<string | null>(null);
  const [framework, setFramework] = useState<PrioritizationFramework>('RICE');
  const [selectedClusterId, setSelectedClusterId] = useState<string>(
    () => workspace.clusters[0]?.cluster_id || 'CLU-01'
  );

  const [chatInput, setChatInput] = useState('');
  const [isChatting, setIsChatting] = useState(false);
  const [chatElapsedSec, setChatElapsedSec] = useState(0);
  const [validatingClusterId, setValidatingClusterId] = useState<string | null>(null);
  const [isGeneratingLoops, setIsGeneratingLoops] = useState(false);
  const [copiedDraftId, setCopiedDraftId] = useState<string | null>(null);

  useEffect(() => {
    if (!isChatting) {
      setChatElapsedSec(0);
      return;
    }
    const startedAt = Date.now();
    const timer = window.setInterval(() => {
      setChatElapsedSec(Math.floor((Date.now() - startedAt) / 1000));
    }, 500);
    return () => window.clearInterval(timer);
  }, [isChatting]);

  const selectedCluster =
    workspace.clusters.find((c) => c.cluster_id === selectedClusterId) ||
    workspace.clusters[0];

  const [pmNotes, setPmNotes] = useState('');
  const [activePrd, setActivePrd] = useState<GeneratedPRD | null>(() => {
    const first = workspace.clusters[0];
    if (!first) return null;
    return workspace.prdsByClusterId?.[first.cluster_id] || buildLocalPRD(first, '');
  });
  const [editableMarkdown, setEditableMarkdown] = useState<string>(() => {
    const first = workspace.clusters[0];
    if (!first) return '';
    return (
      workspace.prdsByClusterId?.[first.cluster_id]?.markdown_body ||
      buildLocalPRD(first, '').markdown_body
    );
  });
  const [copiedMd, setCopiedMd] = useState(false);
  const [linearExportResult, setLinearExportResult] = useState<{
    identifier: string;
    url: string;
    mutation: string;
  } | null>(null);

  useEffect(() => {
    if (selectedCluster) {
      const savedPrd = workspace.prdsByClusterId?.[selectedCluster.cluster_id];
      const nextPrd = savedPrd || buildLocalPRD(selectedCluster, pmNotes);
      setActivePrd(nextPrd);
      setEditableMarkdown(nextPrd.markdown_body);
    } else {
      setActivePrd(null);
      setEditableMarkdown('');
    }
  }, [activeProject.id, selectedCluster?.cluster_id]);

  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteRole, setInviteRole] = useState<'editor' | 'viewer'>('editor');

  const ticketsLookup = useMemo(() => {
    const map = new Map<string, RawTicket>();
    workspace.tickets.forEach((t) => map.set(t.id, t));
    return map;
  }, [workspace.tickets]);

  const availableChannels = useMemo(() => {
    const set = new Set<string>();
    workspace.tickets.forEach((t) => {
      if (t.source) set.add(t.source);
    });
    return ['ALL', ...Array.from(set)];
  }, [workspace.tickets]);

  const availableIntentCategories = useMemo(() => {
    const set = new Set<string>();
    workspace.clusters.forEach((c) => {
      if (c.intent_category) set.add(c.intent_category);
    });
    return ['ALL', ...Array.from(set)];
  }, [workspace.clusters]);

  const availableNoiseCategories = useMemo(() => {
    const set = new Set<string>();
    workspace.enrichedTickets.forEach((t) => {
      if (t.is_noise && t.noise_category) set.add(t.noise_category);
    });
    return ['ALL', ...Array.from(set)];
  }, [workspace.enrichedTickets]);

  const filteredTickets = workspace.tickets.filter((t) => {
    const matchesSource = sourceFilter === 'ALL' || t.source === sourceFilter;
    const matchesSearch =
      !sidebarSearch.trim() ||
      t.content.toLowerCase().includes(sidebarSearch.toLowerCase()) ||
      t.id.toLowerCase().includes(sidebarSearch.toLowerCase()) ||
      t.source.toLowerCase().includes(sidebarSearch.toLowerCase());
    return matchesSource && matchesSearch;
  });

  const signalTickets = workspace.enrichedTickets.filter((t) => !t.is_noise);
  const quarantinedNoiseTickets = workspace.enrichedTickets.filter((t) => t.is_noise);

  const displayedNoiseStageTickets = workspace.enrichedTickets.filter((t) => {
    if (noiseFilterMode === 'SIGNAL' && t.is_noise) return false;
    if (noiseFilterMode === 'NOISE' && !t.is_noise) return false;
    if (noiseCategoryFilter !== 'ALL' && t.noise_category !== noiseCategoryFilter) return false;
    if (noiseSearch.trim()) {
      const q = noiseSearch.toLowerCase();
      return (
        t.id.toLowerCase().includes(q) ||
        t.content.toLowerCase().includes(q) ||
        (t.intent || '').toLowerCase().includes(q)
      );
    }
    return true;
  });

  const approvedClusters = workspace.clusters.filter(
    (c) => c.gate1_status === 'APPROVED'
  );

  const totalArrAcrossTickets = signalTickets.reduce(
    (acc, t) => acc + t.arr_weight,
    0
  );

  const handleRunStage2NoiseFilter = async (
    customTickets?: RawTicket[],
    customLabel?: string,
    diagnostics?: CsvParseDiagnostics
  ) => {
    const targetTickets = customTickets || workspace.tickets;
    if (diagnostics) {
      setLastIngestDiagnostics(diagnostics);
    }
    if (targetTickets.length === 0) {
      setIsIngestModalOpen(true);
      return;
    }
    setUploadPage(1);
    setNoisePage(1);
    setNoiseCategoryFilter('ALL');
    setIsRunningStage(true);
    setStageError(null);
    setStageProgressMsg(
      `Stage 2: Filtering non-product noise & classifying signals across all ${targetTickets.length} rows…`
    );
    let enriched: EnrichedTicket[] = targetTickets.map(enrichTicketDeterministically);
    let modelUsed = 'deterministic-fallback';

    try {
      const headers = await getAuthHeaders();
      const resp = await fetch(`${API_BASE}/api/v1/stages/noise`, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          project_id: activeProject.id,
          tickets: targetTickets,
        }),
      });
      if (resp.ok) {
        const data = await resp.json();
        enriched = data.tickets;
        modelUsed = data.model_used || modelUsed;
        if (data.env_notice) {
          setStageError(data.env_notice);
        }
      } else {
        const txt = await resp.text().catch(() => '');
        setStageError(
          `Stage 2 AI returned HTTP ${resp.status}${txt ? `: ${txt.slice(0, 120)}` : ''}. Applied local classifier.`
        );
      }
    } catch (err) {
      setStageError(
        `Backend unreachable during Stage 2 (${err instanceof Error ? err.message : 'network error'}). Applied local classifier.`
      );
    }

    const noiseIds = enriched.filter((t) => t.is_noise).map((t) => t.id);
    updateWorkspace((prev) => ({
      ...prev,
      batchName: customLabel || prev.batchName,
      tickets: targetTickets,
      enrichedTickets: enriched,
      ...(customTickets
        ? { clusters: [], releaseValidations: [], loopClosures: [], prdsByClusterId: {}, prdChatsByClusterId: {} }
        : {}),
    }));
    if (customTickets) {
      setActivePrd(null);
      setEditableMarkdown('');
    }
    appendActivity(
      'Stage 2: Noise and Enrichment',
      'Executed AI noise filter and signal classification',
      `Processed all ${enriched.length} tickets (${enriched.length - noiseIds.length} product signals, ${noiseIds.length} noise quarantined) via ${modelUsed}.`,
      noiseIds.slice(0, 6)
    );
    setIsRunningStage(false);
    setStageProgressMsg(null);
    selectView('noise');
  };

  const handleOverrideTicketNoise = (ticketId: string) => {
    const target = workspace.enrichedTickets.find((t) => t.id === ticketId);
    if (!target) return;
    const nextIsNoise = !target.is_noise;
    updateWorkspace((prev) => ({
      ...prev,
      enrichedTickets: prev.enrichedTickets.map((t) =>
        t.id === ticketId
          ? {
              ...t,
              is_noise: nextIsNoise,
              noise_category: nextIsNoise ? 'Manual Override' : null,
              noise_reason: nextIsNoise ? 'Manually marked as noise by PM.' : null,
              intent: nextIsNoise ? 'Noise' : enrichTicketDeterministically(t).intent,
            }
          : t
      ),
    }));
  };

  const runClusteringAndTriagePipeline = async (targetView: 'intent' | 'triage') => {
    const inputTickets = signalTickets.length > 0 ? signalTickets : workspace.tickets;
    if (inputTickets.length === 0) {
      selectView('upload');
      return;
    }
    setIsRunningStage(true);
    setStageError(null);
    setStageProgressMsg(
      `Stages 3 & 4: Clustering ${inputTickets.length} verified signals into P0–P4 themes & synthesizing root causes…`
    );
    try {
      const headers = await getAuthHeaders();
      const resp = await fetch(`${API_BASE}/api/v1/stages/triage`, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          project_id: activeProject.id,
          tickets: inputTickets,
        }),
      });
      if (resp.ok) {
        const data = await resp.json();
        if (data.env_notice) {
          setStageError(data.env_notice);
        }
        const hydrated = sortBySeverityHierarchy(
          hydrateTriageClusters(recalculateAndSortClusters(data.clusters || [], framework))
        );
        const downstream = buildDownstreamStagesFromClusters(hydrated);
        updateWorkspace((prev) => ({
          ...prev,
          clusters: hydrated,
          releaseValidations: downstream.releaseValidations,
          loopClosures: downstream.loopClosures,
        }));
        if (hydrated[0]) {
          setSelectedClusterId(hydrated[0].cluster_id);
          const nextPrd =
            workspace.prdsByClusterId?.[hydrated[0].cluster_id] ||
            buildLocalPRD(hydrated[0], pmNotes);
          setActivePrd(nextPrd);
          setEditableMarkdown(nextPrd.markdown_body);
        }
        appendActivity(
          targetView === 'intent' ? 'Stage 3: Intent and Clusters' : 'Stage 4: Root Cause and Triage',
          `Synthesized ${hydrated.length} clusters from ${inputTickets.length} uploaded signals`,
          `Grounded in uploaded tickets via ${data.model_used || 'AI'} with verified citations and P0–P4 severity hierarchy.`,
          hydrated.flatMap((c) => c.ticket_ids).slice(0, 6)
        );
      } else {
        const txt = await resp.text().catch(() => '');
        setStageError(
          `Stages 3 & 4 AI clustering returned HTTP ${resp.status}${txt ? `: ${txt.slice(0, 140)}` : ''}.`
        );
      }
    } catch (err) {
      setStageError(
        `Stages 3 & 4 clustering failed (${err instanceof Error ? err.message : 'network error'}).`
      );
    } finally {
      setIsRunningStage(false);
      setStageProgressMsg(null);
      selectView(targetView);
    }
  };

  const handleRunStage3Clusters = () => runClusteringAndTriagePipeline('intent');
  const handleRunStage4RootCauseTriage = () => runClusteringAndTriagePipeline('triage');

  const handleSeverityOverride = (clusterId: string, nextSeverity: SeverityLevel) => {
    updateWorkspace((prev) => ({
      ...prev,
      clusters: prev.clusters.map((c) =>
        c.cluster_id === clusterId ? { ...c, severity: nextSeverity } : c
      ),
    }));
  };

  const handleMarkAllHighPriorityReady = () => {
    updateWorkspace((prev) => ({
      ...prev,
      clusters: prev.clusters.map((c) =>
        c.severity === 'P0' || c.severity === 'P1' ? { ...c, gate1_status: 'APPROVED' } : c
      ),
    }));
  };

  const handleGate1Decision = (
    clusterId: string,
    decision: 'APPROVED' | 'REJECTED' | 'PENDING'
  ) => {
    const target = workspace.clusters.find((c) => c.cluster_id === clusterId);
    updateWorkspace((prev) => ({
      ...prev,
      clusters: prev.clusters.map((c) =>
        c.cluster_id === clusterId ? { ...c, gate1_status: decision } : c
      ),
    }));
    void saveTriageReviewToSupabase(
      activeProject.id,
      clusterId,
      decision,
      user.email,
      target?.ticket_ids.slice(0, 6) || [clusterId]
    );
    const label =
      decision === 'APPROVED' ? 'Ready for Roadmap' : decision === 'REJECTED' ? 'Deferred' : 'Needs Review';
    appendActivity(
      'Stage 4: Root Cause & Triage',
      `Cluster ${clusterId} set to ${label}`,
      `${target?.theme_title || clusterId} updated by PM.`,
      target?.ticket_ids.slice(0, 4) || [clusterId]
    );
  };

  const handleFrameworkSwitch = async (nextFramework: PrioritizationFramework) => {
    setFramework(nextFramework);
    const reRanked = recalculateAndSortClusters(
      workspace.clusters,
      nextFramework
    ) as TriageCluster[];
    updateWorkspace((prev) => ({
      ...prev,
      clusters: reRanked,
    }));

    try {
      await fetch(`${API_BASE}/api/v1/prioritize`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          framework: nextFramework,
          clusters: reRanked,
        }),
      });
    } catch {
      // Client-side mirror is 100% deterministic
    }
  };

  const handleClusterSliderChange = (
    clusterId: string,
    field: keyof Pick<
      TriageCluster,
      | 'reach_count'
      | 'impact_score'
      | 'confidence_score'
      | 'effort_score'
      | 'wsjf_cod'
      | 'wsjf_duration'
      | 'ice_ease'
    >,
    value: number
  ) => {
    const updatedList = workspace.clusters.map((c) =>
      c.cluster_id === clusterId ? { ...c, [field]: value } : c
    );
    const reRanked = recalculateAndSortClusters(
      updatedList,
      framework
    ) as TriageCluster[];
    updateWorkspace((prev) => ({
      ...prev,
      clusters: reRanked,
    }));
  };

  const handleGeneratePrdForCluster = async (cluster: TriageCluster) => {
    setSelectedClusterId(cluster.cluster_id);
    setIsRunningStage(true);
    setStageError(null);
    setStageProgressMsg(`Kimi K3.1 Pro is synthesizing Gherkin PRD for ${cluster.cluster_id}…`);
    setLinearExportResult(null);

    try {
      const headers = await getAuthHeaders();
      const response = await fetch(`${API_BASE}/api/v1/generate-prd`, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          cluster,
          pm_notes: pmNotes,
        }),
      });
      if (response.ok) {
        const prdData: GeneratedPRD = await response.json();
        setActivePrd(prdData);
        setEditableMarkdown(prdData.markdown_body);
        updateWorkspace((prev) => ({
          ...prev,
          prdsByClusterId: {
            ...(prev.prdsByClusterId || {}),
            [cluster.cluster_id]: prdData,
          },
        }));
        appendActivity(
          'Stage 6: HITL PRD Studio',
          `Synthesized Gherkin PRD for ${cluster.cluster_id}`,
          `${prdData.title} (${prdData.engine_used})`,
          cluster.ticket_ids.slice(0, 4)
        );
        setIsRunningStage(false);
        setStageProgressMsg(null);
        selectView('prd');
        return;
      }
      const errDetail = await response.text().catch(() => '');
      setStageError(
        `Stage 6 AI synthesis returned HTTP ${response.status}${errDetail ? `: ${errDetail.slice(0, 140)}` : ''}. Loaded local structured spec.`
      );
    } catch (err) {
      setStageError(
        `Backend unreachable (${err instanceof Error ? err.message : 'network error'}). Loaded local structured Gherkin spec for ${cluster.cluster_id}.`
      );
    }

    const fallbackPrd = buildLocalPRD(cluster, pmNotes);
    setActivePrd(fallbackPrd);
    setEditableMarkdown(fallbackPrd.markdown_body);
    updateWorkspace((prev) => ({
      ...prev,
      prdsByClusterId: {
        ...(prev.prdsByClusterId || {}),
        [cluster.cluster_id]: fallbackPrd,
      },
    }));
    appendActivity(
      'Stage 6: HITL PRD Studio',
      `Synthesized Gherkin PRD for ${cluster.cluster_id}`,
      fallbackPrd.title,
      cluster.ticket_ids.slice(0, 4)
    );
    setIsRunningStage(false);
    setStageProgressMsg(null);
    selectView('prd');
  };

  const handleDownloadMarkdown = () => {
    if (!activePrd) return;
    const blob = new Blob([editableMarkdown], {
      type: 'text/markdown;charset=utf-8',
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${activePrd.prd_id.toLowerCase()}-spec.md`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const handleCopyMarkdown = () => {
    navigator.clipboard.writeText(editableMarkdown);
    setCopiedMd(true);
    setTimeout(() => setCopiedMd(false), 2000);
  };

  const handleExportLinear = async () => {
    if (!activePrd || !selectedCluster) return;
    try {
      const response = await fetch(`${API_BASE}/api/v1/export-linear`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          cluster_id: activePrd.cluster_id,
          title: activePrd.title,
          markdown_body: editableMarkdown,
          severity: selectedCluster.severity,
          team_key: 'COL',
        }),
      });
      if (response.ok) {
        const data = await response.json();
        setLinearExportResult({
          identifier: data.issue_identifier,
          url: data.issue_url,
          mutation: data.graphql_mutation_preview,
        });
        return;
      }
    } catch {
      // Fallback preview
    }

    setLinearExportResult({
      identifier: `COL-${activePrd.cluster_id.replace('CLU-', '1')}`,
      url: `https://linear.app/collabsense/issue/COL-${activePrd.cluster_id.replace('CLU-', '1')}`,
      mutation:
        'mutation IssueCreate($input: IssueCreateInput!) { issueCreate(input: $input) { success issue { id identifier url } } }',
    });
  };

  const handleApplyChatPrdUpdate = (
    cluster: TriageCluster,
    updatedPrd: GeneratedPRD,
    userMsg: PRDChatMessage,
    assistantMsg: PRDChatMessage
  ) => {
    setActivePrd(updatedPrd);
    setEditableMarkdown(updatedPrd.markdown_body);
    updateWorkspace((prev) => ({
      ...prev,
      prdsByClusterId: {
        ...(prev.prdsByClusterId || {}),
        [cluster.cluster_id]: updatedPrd,
      },
      prdChatsByClusterId: {
        ...(prev.prdChatsByClusterId || {}),
        [cluster.cluster_id]: [
          ...(prev.prdChatsByClusterId?.[cluster.cluster_id] || []),
          userMsg,
          assistantMsg,
        ],
      },
    }));
    appendActivity(
      'Stage 6: Interactive PRD Studio',
      `Refined PRD for ${cluster.cluster_id} via AI Assistant`,
      assistantMsg.content,
      cluster.ticket_ids.slice(0, 4)
    );
  };

  const handleSendChatPrompt = async (promptText: string) => {
    if (!promptText.trim()) return;
    const userMsg: ChatMessageItem = {
      id: `USR-${Date.now()}`,
      role: 'user',
      content: promptText.trim(),
      citations: [],
      timestamp: new Date().toISOString(),
    };
    setChatInput('');
    setStageError(null);
    setIsChatting(true);

    updateWorkspace((prev) => ({
      ...prev,
      chatMessages: [...prev.chatMessages, userMsg],
    }));
    void saveChatMessageToSupabase(activeProject.id, userMsg);

    let errReason = '';
    try {
      const headers = await getAuthHeaders();
      const resp = await fetch(`${API_BASE}/api/v1/copilot/chat`, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          project_id: activeProject.id,
          project_name: activeProject.name,
          okr_focus: activeProject.okr_focus,
          prompt: promptText.trim(),
          tickets: workspace.tickets,
          clusters: workspace.clusters,
        }),
      });
      if (resp.ok) {
        const data = await resp.json();
        const assistantMsg: ChatMessageItem = {
          id: `AST-${Date.now()}`,
          role: 'assistant',
          content: data.reply,
          citations: data.citations || [],
          suggestedStage: data.suggested_stage || (workspace.tickets.length ? 'triage' : 'upload'),
          modelUsed: data.model_used,
          latencyMs: data.latency_ms,
          timestamp: new Date().toISOString(),
        };
        updateWorkspace((prev) => ({
          ...prev,
          chatMessages: [...prev.chatMessages, assistantMsg],
        }));
        void saveChatMessageToSupabase(activeProject.id, assistantMsg);
        setIsChatting(false);
        return;
      }
      const txt = await resp.text().catch(() => '');
      errReason = `HTTP ${resp.status}${txt ? `: ${txt.slice(0, 120)}` : ''}`;
    } catch (err) {
      errReason = err instanceof Error ? err.message : 'backend unreachable';
    }

    setStageError(`Co-Pilot error (${errReason}). Check backend server at ${API_BASE}.`);
    const fallbackMsg: ChatMessageItem = {
      id: `AST-${Date.now()}`,
      role: 'assistant',
      content:
        workspace.tickets.length === 0
          ? `Could not reach Co-Pilot (${errReason}). Ask any PM strategy question or upload feedback in Stage 1.`
          : `Could not reach Co-Pilot (${errReason}). Your project has ${workspace.tickets.length} uploaded ticket(s) ready in Stage 1.`,
      citations: workspace.tickets.slice(0, 3).map((t) => t.id),
      suggestedStage: workspace.tickets.length === 0 ? 'upload' : 'noise',
      timestamp: new Date().toISOString(),
    };
    updateWorkspace((prev) => ({
      ...prev,
      chatMessages: [...prev.chatMessages, fallbackMsg],
    }));
    setIsChatting(false);
  };

  const handleInviteMember = (e: React.FormEvent) => {
    e.preventDefault();
    if (!inviteEmail.trim()) return;
    const newMember = {
      id: `MEM-${Date.now().toString().slice(-3)}`,
      email: inviteEmail.trim(),
      fullName: inviteEmail.trim().split('@')[0],
      role: inviteRole,
      status: 'invited' as const,
      joinedAt: new Date().toISOString().slice(0, 10),
    };
    updateWorkspace((prev) => ({
      ...prev,
      members: [...prev.members, newMember],
    }));
    void inviteMemberToSupabase(activeProject.id, newMember);
    appendActivity(
      'Project Settings: Collab',
      `Invited ${inviteEmail.trim()} as ${inviteRole}`,
      `Project-scoped RLS access granted to ${activeProject.name}.`,
      []
    );
    setInviteEmail('');
  };

  const handleLoopClosureStatusChange = (
    draftId: string,
    nextStatus: 'DRAFT' | 'APPROVED_TO_SEND' | 'SENT'
  ) => {
    const found = workspace.loopClosures.find((d) => d.draft_id === draftId);
    updateWorkspace((prev) => ({
      ...prev,
      loopClosures: prev.loopClosures.map((d) =>
        d.draft_id === draftId ? { ...d, status: nextStatus } : d
      ),
    }));
    appendActivity(
      'Stage 8: Loop Closure',
      `Customer update ${draftId} (${found?.channel}) marked ${nextStatus}`,
      `Notified ${found?.recipient_segment || 'customers'}.`,
      found?.cited_tickets.slice(0, 4) || []
    );
  };

  const handleUpdateReleaseValidationField = (
    clusterId: string,
    field: 'release_tag' | 'post_release_daily_tickets' | 'feature_flag' | 'rollout_pct' | 'verdict',
    value: string | number
  ) => {
    updateWorkspace((prev) => ({
      ...prev,
      releaseValidations: prev.releaseValidations.map((rv) => {
        if (rv.cluster_id !== clusterId) return rv;
        if (field === 'release_tag') {
          return { ...rv, release_tag: String(value) };
        }
        if (field === 'feature_flag') {
          return { ...rv, feature_flag: String(value) };
        }
        if (field === 'rollout_pct') {
          return { ...rv, rollout_pct: Number(value) || 0 };
        }
        if (field === 'verdict') {
          const nextV = value as ReleaseValidationItem['verdict'];
          return { ...rv, verdict: nextV, spike_detected: nextV === 'REGRESSION_SPIKE' };
        }
        const post = Math.max(0, Number(value) || 0);
        const pre = Math.max(0.1, rv.pre_release_daily_tickets);
        const delta_pct = Number((((post - pre) / pre) * 100).toFixed(1));
        const spike_detected = post > pre * 1.15;
        return {
          ...rv,
          post_release_daily_tickets: post,
          delta_pct,
          spike_detected,
          verdict: spike_detected
            ? 'REGRESSION_SPIKE'
            : post <= pre * 0.65 && post <= 2.0
              ? 'VERIFIED_RESOLVED'
              : 'MONITORING',
        };
      }),
    }));
  };

  const handleAddCustomReleaseMonitor = (item: ReleaseValidationItem) => {
    updateWorkspace((prev) => ({
      ...prev,
      releaseValidations: [item, ...prev.releaseValidations],
    }));
  };

  const handleValidateReleaseCluster = async (
    rv: ReleaseValidationItem,
    notes = ''
  ) => {
    setValidatingClusterId(rv.cluster_id);
    setStageError(null);
    setStageProgressMsg(
      `Validating ${rv.release_tag} post-release telemetry for ${rv.cluster_id}…`
    );
    try {
      const headers = await getAuthHeaders();
      const resp = await fetch(`${API_BASE}/api/v1/stages/validate-release`, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          cluster_id: rv.cluster_id,
          theme_title: rv.theme_title,
          release_tag: rv.release_tag || 'v1.0.0-rc1',
          feature_flag: rv.feature_flag || '',
          pre_release_daily_tickets: rv.pre_release_daily_tickets,
          post_release_daily_tickets: rv.post_release_daily_tickets,
          post_release_notes: notes || rv.regression_summary,
          citations: rv.citations,
        }),
      });
      if (resp.ok) {
        const updated: ReleaseValidationItem = await resp.json();
        updateWorkspace((prev) => ({
          ...prev,
          releaseValidations: prev.releaseValidations.map((item) =>
            item.cluster_id === rv.cluster_id
              ? {
                  ...item,
                  ...updated,
                  feature_flag: rv.feature_flag,
                  rollout_pct: rv.rollout_pct,
                  cohort_window: rv.cohort_window,
                }
              : item
          ),
        }));
        appendActivity(
          'Stage 7: Release & Validation',
          `Validated ${updated.release_tag} for ${updated.cluster_id}`,
          `${updated.verdict} (${updated.delta_pct > 0 ? '+' : ''}${updated.delta_pct}%)`,
          updated.citations.slice(0, 4)
        );
      } else {
        const txt = await resp.text().catch(() => '');
        setStageError(
          `Stage 7 validation returned HTTP ${resp.status}${txt ? `: ${txt.slice(0, 120)}` : ''}.`
        );
      }
    } catch (err) {
      setStageError(
        `Stage 7 validation failed (${err instanceof Error ? err.message : 'network error'}).`
      );
    } finally {
      setValidatingClusterId(null);
      setStageProgressMsg(null);
    }
  };

  const handleGenerateLoopClosuresAI = async () => {
    if (workspace.clusters.length === 0) return;
    setIsGeneratingLoops(true);
    setStageError(null);
    setStageProgressMsg(
      'Drafting personalized customer updates & internal Support/Sales playbooks…'
    );
    try {
      const headers = await getAuthHeaders();
      const resp = await fetch(`${API_BASE}/api/v1/stages/loop-closure/generate`, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          project_name: activeProject.name,
          clusters: workspace.clusters,
        }),
      });
      if (resp.ok) {
        const drafts: LoopClosureDraftItem[] = await resp.json();
        updateWorkspace((prev) => ({
          ...prev,
          loopClosures: drafts,
        }));
        appendActivity(
          'Stage 8: Closing the Loop',
          `Drafted ${drafts.length} AI customer updates & internal playbooks`,
          `Grounded in verified citations across ${workspace.clusters.length} cluster(s).`,
          drafts.flatMap((d) => d.cited_tickets).slice(0, 6)
        );
      } else {
        const txt = await resp.text().catch(() => '');
        setStageError(
          `Stage 8 draft generation returned HTTP ${resp.status}${txt ? `: ${txt.slice(0, 120)}` : ''}.`
        );
      }
    } catch (err) {
      setStageError(
        `Stage 8 AI drafting failed (${err instanceof Error ? err.message : 'network error'}).`
      );
    } finally {
      setIsGeneratingLoops(false);
      setStageProgressMsg(null);
    }
  };

  const handleUpdateLoopClosureDraft = (
    draftId: string,
    field: 'subject' | 'message_body' | 'channel' | 'internal_playbook_note',
    value: string
  ) => {
    updateWorkspace((prev) => ({
      ...prev,
      loopClosures: prev.loopClosures.map((d) =>
        d.draft_id === draftId ? { ...d, [field]: value } : d
      ),
    }));
  };

  const handleCopyLoopClosureDraft = (draft: LoopClosureDraftItem) => {
    const text = `Subject: ${draft.subject}\n\n${draft.message_body}${
      draft.internal_playbook_note
        ? `\n\n---\nInternal Support/Sales Playbook:\n${draft.internal_playbook_note}`
        : ''
    }`;
    navigator.clipboard.writeText(text);
    setCopiedDraftId(draft.draft_id);
    setTimeout(() => setCopiedDraftId(null), 2000);
  };

  const handleLogout = async () => {
    await clearSessionUser();
    navigate('/login');
  };

  const PROJECT_SETTINGS_NAV: {
    id: WorkspaceViewId;
    label: string;
    icon: React.ElementType;
    badge?: string;
    legacyTestId?: string;
  }[] = [
    { id: 'home', label: 'Home', icon: Home },
    {
      id: 'upload',
      label: 'Upload Data',
      icon: Upload,
      badge: `${workspace.tickets.length}`,
      legacyTestId: 'tab-MOD_1_INGEST',
    },
    {
      id: 'activity',
      label: 'Activity',
      icon: Activity,
      badge: `${workspace.activityLog.length}`,
    },
    {
      id: 'collab',
      label: 'Collab',
      icon: Users,
      badge: `${workspace.members.length}`,
    },
  ];

  const PRODUCT_MODULES_NAV: {
    id: WorkspaceViewId;
    stageNum: string;
    label: string;
    shortLabel: string;
    icon: React.ElementType;
    legacyTestId?: string;
  }[] = [
    {
      id: 'noise',
      stageNum: 'S2',
      label: 'Noise & Enrichment',
      shortLabel: 'Noise Filter',
      icon: Filter,
    },
    {
      id: 'intent',
      stageNum: 'S3',
      label: 'Intent & Clusters',
      shortLabel: 'Intent & Clusters',
      icon: Layers,
    },
    {
      id: 'triage',
      stageNum: 'S4',
      label: 'Root Cause & Triage',
      shortLabel: 'Root Cause & Triage',
      icon: AlertOctagon,
      legacyTestId: 'tab-MOD_6_EVALS',
    },
    {
      id: 'prioritization',
      stageNum: 'S5',
      label: 'Prioritization',
      shortLabel: 'Prioritization',
      icon: Calculator,
      legacyTestId: 'tab-MOD_2_MATRIX',
    },
    {
      id: 'prd',
      stageNum: 'S6',
      label: 'PRD Drafting Studio',
      shortLabel: 'PRD Studio',
      icon: FileCode2,
      legacyTestId: 'tab-MOD_3_PRD',
    },
    {
      id: 'validation',
      stageNum: 'S7',
      label: 'Release Analytics',
      shortLabel: 'Release Analytics',
      icon: ActivitySquare,
      legacyTestId: 'tab-MOD_4_ECON',
    },
    {
      id: 'closure',
      stageNum: 'S8',
      label: 'Loop Closure',
      shortLabel: 'Loop Closure',
      icon: CheckCircle2,
      legacyTestId: 'tab-MOD_5_GROWTH',
    },
  ];

  const ALL_WORKFLOW_STEPS: { id: WorkspaceViewId; label: string }[] = [
    { id: 'home', label: 'Home AI Co-Pilot' },
    { id: 'upload', label: 'Stage 1: Upload Data' },
    { id: 'noise', label: 'Stage 2: Noise & Enrichment' },
    { id: 'intent', label: 'Stage 3: Intent & Clusters' },
    { id: 'triage', label: 'Stage 4: Root Cause & Triage' },
    { id: 'prioritization', label: 'Stage 5: Prioritization' },
    { id: 'prd', label: 'Stage 6: PRD Drafting Studio' },
    { id: 'validation', label: 'Stage 7: Release Analytics' },
    { id: 'closure', label: 'Stage 8: Loop Closure' },
  ];

  const activeStepIndex = ALL_WORKFLOW_STEPS.findIndex((s) => s.id === activeView);
  const prevStep = activeStepIndex > 0 ? ALL_WORKFLOW_STEPS[activeStepIndex - 1] : null;
  const nextStep =
    activeStepIndex >= 0 && activeStepIndex < ALL_WORKFLOW_STEPS.length - 1
      ? ALL_WORKFLOW_STEPS[activeStepIndex + 1]
      : null;

  const renderSeverityBadge = (sev: string) => {
    const s = getSeverityStyle(sev);
    return <span className={s.badgeClass}>{sev}</span>;
  };

  return (
    <div className="h-screen w-full overflow-hidden flex bg-paper text-ink">
      {/* Persistent Left Sidebar */}
      <aside
        data-testid="app-left-sidebar"
        className={`${
          sidebarCollapsed ? 'w-16' : 'w-64'
        } h-screen sticky top-0 left-0 shrink-0 bg-paper-2 border-r border-rule flex flex-col justify-between transition-colors duration-150 select-none z-30 overflow-hidden`}
      >
        <div className="flex-1 overflow-y-auto ph-no-scrollbar p-2.5 space-y-3">
          <div className="relative">
            <div className="flex items-center justify-between gap-1 px-1 py-1">
              {!sidebarCollapsed && (
                <button
                  type="button"
                  data-testid="project-switcher-btn"
                  onClick={() => setSwitcherOpen((v) => !v)}
                  className="flex items-center gap-2 text-left hover:bg-paper-3 px-1.5 py-1 rounded-input transition-colors min-w-0 flex-1"
                  title="Switch or Create Project"
                >
                  <span className="w-5 h-5 rounded-input bg-board text-board-type text-xs font-semibold flex items-center justify-center shrink-0">
                    {activeProject.name.charAt(0).toUpperCase()}
                  </span>
                  <span className="font-semibold text-xs text-ink truncate">
                    {activeProject.name}
                  </span>
                  <ChevronDown className="w-3.5 h-3.5 text-muted shrink-0" />
                </button>
              )}

              <button
                type="button"
                onClick={() => setSidebarCollapsed((c) => !c)}
                className="p-1.5 rounded-input text-muted hover:bg-paper-3 hover:text-ink transition-colors"
                title={sidebarCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
                aria-label={sidebarCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
              >
                {sidebarCollapsed ? (
                  <PanelLeftOpen className="w-4 h-4" />
                ) : (
                  <PanelLeftClose className="w-4 h-4" />
                )}
              </button>
            </div>

            {switcherOpen && !sidebarCollapsed && (
              <div className="mt-1 stock-card border border-rule p-1.5 space-y-1 z-40">
                <div className="px-2 py-1 text-xs font-medium text-muted">
                  Switch project memory
                </div>
                {projects.map((p) => (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => handleSwitchProject(p.id)}
                    className={`w-full text-left px-2.5 py-1.5 rounded-input text-xs flex items-center justify-between ${
                      p.id === activeProject.id
                        ? 'bg-paper-2 font-semibold text-paid'
                        : 'hover:bg-paper text-ink-2'
                    }`}
                  >
                    <span className="truncate">{p.name}</span>
                    {p.id === activeProject.id && (
                      <Check className="w-3.5 h-3.5 text-paid shrink-0" />
                    )}
                  </button>
                ))}
                <button
                  type="button"
                  onClick={() => {
                    setSwitcherOpen(false);
                    navigate('/projects');
                  }}
                  className="w-full text-left px-2.5 py-1.5 rounded-input text-xs font-semibold text-paid hover:bg-paper flex items-center gap-1.5 border-t border-rule pt-2 whitespace-nowrap"
                >
                  <FolderPlus className="w-3.5 h-3.5" />
                  <span>Manage projects</span>
                </button>
              </div>
            )}
          </div>

          {!sidebarCollapsed && (
            <div className="grid grid-cols-3 gap-1 p-1 stock-groove text-xs font-medium">
              <button
                type="button"
                onClick={() => selectView('prioritization')}
                className={`py-1 rounded-input transition-colors ${
                  activeView !== 'home' && activeView !== 'upload'
                    ? 'stock-card text-ink font-semibold'
                    : 'text-ink-2 hover:text-ink'
                }`}
              >
                Apps
              </button>
              <button
                type="button"
                onClick={() => selectView('upload')}
                className={`py-1 rounded-input transition-colors ${
                  activeView === 'upload'
                    ? 'stock-card text-ink font-semibold'
                    : 'text-ink-2 hover:text-ink'
                }`}
              >
                Files
              </button>
              <button
                type="button"
                onClick={() => selectView('home')}
                className={`py-1 rounded-input transition-colors ${
                  activeView === 'home'
                    ? 'stock-card text-ink font-semibold'
                    : 'text-ink-2 hover:text-ink'
                }`}
              >
                Chat
              </button>
            </div>
          )}

          {!sidebarCollapsed && (
            <div className="relative">
              <Search className="w-3.5 h-3.5 text-muted absolute left-2.5 top-3" />
              <input
                type="text"
                aria-label="Filter tickets"
                value={sidebarSearch}
                onChange={(e) => {
                  setSidebarSearch(e.target.value);
                  if (activeView !== 'upload') {
                    selectView('upload');
                  }
                }}
                placeholder="Filter tickets (Ctrl K)…"
                className="cs-input pl-8 pr-2.5 py-1.5 text-xs"
              />
              {sidebarSearch && (
                <button
                  type="button"
                  onClick={() => setSidebarSearch('')}
                  className="absolute right-2 top-2.5 text-muted hover:text-ink"
                  aria-label="Clear search"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
          )}

          {/* Group 1: Project Settings */}
          <div className="space-y-0.5">
            {!sidebarCollapsed && (
              <div className="px-2 py-1 text-xs font-medium text-muted">
                Project settings
              </div>
            )}
            {PROJECT_SETTINGS_NAV.map((item) => {
              const Icon = item.icon;
              const isActive = activeView === item.id;
              return (
                <button
                  key={item.id}
                  type="button"
                  data-testid={item.legacyTestId || `nav-${item.id}`}
                  onClick={() => selectView(item.id)}
                  title={item.label}
                  className={`w-full flex items-center gap-2.5 px-2.5 py-1.5 rounded-input text-xs transition-colors whitespace-nowrap ${
                    isActive
                      ? 'stock-card text-ink font-semibold'
                      : 'text-ink-2 font-medium hover:bg-paper-3 hover:text-ink'
                  }`}
                >
                  <Icon
                    className={`w-4 h-4 shrink-0 ${
                      isActive ? 'text-paid' : 'text-muted'
                    }`}
                  />
                  {!sidebarCollapsed && (
                    <>
                      <span className="truncate flex-1 text-left">{item.label}</span>
                      {item.badge && (
                        <span className="fig font-mono text-xs bg-cotton border border-rule px-1.5 py-0.5 rounded-input text-muted">
                          {item.badge}
                        </span>
                      )}
                    </>
                  )}
                </button>
              );
            })}
          </div>

          {/* Group 2: Product Modules (8-Stage) */}
          <div className="space-y-0.5 pt-2 border-t border-rule">
            {!sidebarCollapsed && (
              <div className="px-2 py-1 text-xs font-medium text-muted">
                Product modules (8-stage)
              </div>
            )}
            {PRODUCT_MODULES_NAV.map((mod) => {
              const Icon = mod.icon;
              const isActive = activeView === mod.id;
              return (
                <button
                  key={mod.id}
                  type="button"
                  data-testid={mod.legacyTestId || `nav-${mod.id}`}
                  onClick={() => selectView(mod.id)}
                  title={`${mod.stageNum}: ${mod.label}`}
                  className={`w-full flex items-center gap-2.5 px-2.5 py-1.5 rounded-input text-xs transition-colors whitespace-nowrap ${
                    isActive
                      ? 'stock-card text-ink font-semibold'
                      : 'text-ink-2 font-medium hover:bg-paper-3 hover:text-ink'
                  }`}
                >
                  <Icon
                    className={`w-4 h-4 shrink-0 ${
                      isActive ? 'text-paid' : 'text-muted'
                    }`}
                  />
                  {!sidebarCollapsed && (
                    <>
                      <span className="truncate flex-1 text-left">{mod.label}</span>
                      <span className="fig font-mono text-xs text-muted">
                        {mod.stageNum}
                      </span>
                    </>
                  )}
                </button>
              );
            })}
          </div>
        </div>

        <div className="shrink-0 p-2.5 border-t border-rule bg-paper-2">
          <div className="flex items-center justify-between gap-2">
            {!sidebarCollapsed && (
              <div className="min-w-0">
                <div className="text-xs font-semibold text-ink truncate">
                  {user.fullName}
                </div>
                <div className="text-xs text-muted truncate">
                  {activeProject.name}
                </div>
              </div>
            )}
            <button
              type="button"
              onClick={handleLogout}
              className="p-1.5 rounded-input bg-cotton border border-rule text-muted hover:text-ink"
              title="Sign out"
              aria-label="Sign out"
            >
              <LogOut className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      </aside>

      {/* Right Main Workspace Scene */}
      <div className="flex-1 flex flex-col min-w-0 h-screen overflow-hidden">
        <header className="h-12 shrink-0 bg-paper border-b border-rule px-4 sm:px-6 flex items-center justify-between gap-3 z-20">
          <div className="flex items-center gap-2 text-xs font-medium text-muted min-w-0 flex-1">
            <button
              type="button"
              onClick={() => navigate('/projects')}
              className="hover:text-ink font-semibold shrink-0 whitespace-nowrap"
            >
              {activeProject.name}
            </button>
            <span className="shrink-0">/</span>
            <span className="font-semibold text-ink truncate">
              {ALL_WORKFLOW_STEPS.find((s) => s.id === activeView)?.label || 'Workspace'}
            </span>
          </div>

          <div className="flex items-center gap-2 text-xs shrink-0">
            <span className="hidden lg:inline-flex items-center gap-1 bg-cotton border border-rule rounded-input px-2.5 py-1">
              <span>Signals:</span>
              <strong className="fig font-mono text-paid">{signalTickets.length}</strong>
            </span>
            <span className="hidden lg:inline-flex items-center gap-1 bg-cotton border border-rule rounded-input px-2.5 py-1">
              <span>Triaged ready:</span>
              <strong className="fig font-mono text-success">
                {approvedClusters.length}/{workspace.clusters.length}
              </strong>
            </span>
            {totalArrAcrossTickets > 0 && (
              <span className="hidden xl:inline-flex items-center gap-1 bg-cotton border border-rule rounded-input px-2.5 py-1">
                <span>ARR:</span>
                <strong className="fig font-mono">${(totalArrAcrossTickets / 1000).toFixed(0)}k</strong>
              </span>
            )}
            <button
              type="button"
              onClick={() => setIsIngestModalOpen(true)}
              className="cs-btn-secondary text-xs py-1 px-2.5 whitespace-nowrap"
            >
              <Upload className="w-3.5 h-3.5 text-paid" />
              <span>Ingest CSV</span>
            </button>
          </div>
        </header>

        {/* Single-Row 8-Stage Navigation Strip */}
        <div className="shrink-0 bg-paper-2 border-b border-rule px-4 sm:px-6 flex flex-nowrap items-center gap-1 overflow-x-auto ph-no-scrollbar z-20">
          {[
            { id: 'home' as WorkspaceViewId, num: '00', label: 'Home' },
            { id: 'upload' as WorkspaceViewId, num: 'S1', label: 'Upload Data' },
            { id: 'noise' as WorkspaceViewId, num: 'S2', label: 'Noise Filter' },
            { id: 'intent' as WorkspaceViewId, num: 'S3', label: 'Intent & Clusters' },
            { id: 'triage' as WorkspaceViewId, num: 'S4', label: 'Root Cause & Triage' },
            { id: 'prioritization' as WorkspaceViewId, num: 'S5', label: 'Prioritization' },
            { id: 'prd' as WorkspaceViewId, num: 'S6', label: 'PRD Studio' },
            { id: 'validation' as WorkspaceViewId, num: 'S7', label: 'Release Analytics' },
            { id: 'closure' as WorkspaceViewId, num: 'S8', label: 'Loop Closure' },
          ].map((st) => {
            const isActive = activeView === st.id;
            return (
              <button
                key={st.id}
                type="button"
                onClick={() => selectView(st.id)}
                className={`shrink-0 whitespace-nowrap inline-flex items-center gap-1.5 px-3 py-2 text-xs border-b-2 transition-colors ${
                  isActive
                    ? 'border-paid text-ink font-semibold bg-cotton'
                    : 'border-transparent text-muted font-medium hover:text-ink'
                }`}
              >
                <span className="fig font-mono text-xs text-muted">{st.num}</span>
                <span>{st.label}</span>
              </button>
            );
          })}
        </div>

        {/* Dedicated Scrollable Scene Body */}
        <main
          ref={mainScrollRef}
          data-testid="app-main-scroll-container"
          className="flex-1 overflow-y-auto overflow-x-hidden ph-custom-scrollbar px-4 sm:px-6 py-5"
        >
          <div className="max-w-7xl w-full mx-auto space-y-5 pb-8">
            {stageProgressMsg && (
              <div
                data-testid="stage-progress-banner"
                className="stock-card border-paid px-4 py-2.5 text-xs text-ink flex items-center gap-2.5 cs-panel-enter"
              >
                <RefreshCw className="w-3.5 h-3.5 animate-spin text-paid shrink-0" />
                <span className="font-medium">{stageProgressMsg}</span>
              </div>
            )}
            {stageError && (
              <div
                data-testid="stage-error-banner"
                className="bg-error-soft border border-error text-error rounded-input px-4 py-2.5 text-xs flex items-center justify-between gap-3"
              >
                <div className="flex items-center gap-2 min-w-0">
                  <AlertOctagon className="w-4 h-4 shrink-0" />
                  <span className="truncate">{stageError}</span>
                </div>
                <button
                  type="button"
                  onClick={() => setStageError(null)}
                  aria-label="Dismiss alert"
                  className="p-0.5 hover:opacity-75 shrink-0"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
            )}

            {/* VIEW 0: HOME — AI COMMAND CO-PILOT */}
            {activeView === 'home' && (
              <div className="max-w-4xl mx-auto pt-4 space-y-6">
                <div className="flex flex-col items-center text-center space-y-2.5 relative">
                  <span
                    className="two26-sticker-pill text-xs"
                    style={{ transform: 'rotate(-2.5deg)' }}
                  >
                    Two26 Studio Edition · &lt;7.5s Auto-Failover
                  </span>
                  <h1 className="two26-display text-4xl sm:text-6xl text-[#FF5400] text-center pt-1">
                    HELLO {user.fullName.split(' ')[0].toUpperCase()}
                  </h1>
                  <p className="text-xs sm:text-sm font-medium text-ink-2 max-w-lg">
                    Ask strategic PM questions grounded in your uploaded customer signals. Kimi K3.1 Pro automatically falls back within 8s for guaranteed low-latency answers.
                  </p>
                </div>

                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    handleSendChatPrompt(chatInput);
                  }}
                  className="max-w-2xl mx-auto"
                >
                  <div className="stock-card border-2 border-[#111111] rounded-full px-4 py-2 flex items-center gap-2">
                    <input
                      type="text"
                      aria-label="Ask CollabSense Co-Pilot"
                      data-testid="home-copilot-input"
                      value={chatInput}
                      onChange={(e) => setChatInput(e.target.value)}
                      placeholder="Ask about blockers, PRDs, priorities, or workflow next steps…"
                      className="flex-1 bg-transparent text-sm text-ink placeholder:text-muted focus:outline-none"
                    />
                    <button
                      type="submit"
                      disabled={isChatting || !chatInput.trim()}
                      data-testid="home-copilot-submit"
                      aria-label="Submit command"
                      className="cs-btn-primary text-xs px-3 py-1.5"
                    >
                      {isChatting ? (
                        <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                      ) : (
                        <ArrowRight className="w-3.5 h-3.5" />
                      )}
                    </button>
                  </div>
                </form>

                {/* Unified Single Conversation Thread */}
                {(isChatting || workspace.chatMessages.length > 0) && (
                  <div className="max-w-3xl mx-auto">
                    <PostHogWindow
                      title="Co-Pilot Conversation"
                      badgeText={`${workspace.chatMessages.length} message(s)`}
                      badgeVariant="green"
                      rightSlot={
                        workspace.chatMessages.length > 0 ? (
                          <button
                            type="button"
                            onClick={() =>
                              updateWorkspace((prev) => ({ ...prev, chatMessages: [] }))
                            }
                            className="text-xs text-muted hover:text-ink px-2 py-0.5 border border-rule rounded-input bg-paper"
                          >
                            Clear thread
                          </button>
                        ) : undefined
                      }
                    >
                      <div className="space-y-3 max-h-[420px] overflow-y-auto pr-1">
                        {workspace.chatMessages.map((msg) => (
                          <div
                            key={msg.id}
                            className={`p-3.5 rounded-stock border text-xs space-y-2 cs-panel-enter ${
                              msg.role === 'user'
                                ? 'bg-paper-2 border-rule-2'
                                : 'bg-paper border-rule'
                            }`}
                          >
                            <div className="flex flex-wrap items-center justify-between gap-2 text-muted">
                              <div className="flex items-center gap-2">
                                <strong className="text-ink">
                                  {msg.role === 'user' ? user.fullName : 'CollabSense Co-Pilot'}
                                </strong>
                                {msg.modelUsed && (
                                  <span className="fig font-mono text-[11px] bg-cotton border border-rule px-2 py-0.5 rounded-input text-ink-2">
                                    {msg.modelUsed.split('/').pop()}
                                    {msg.latencyMs ? ` · ${(msg.latencyMs / 1000).toFixed(1)}s` : ''}
                                  </span>
                                )}
                              </div>
                              {msg.suggestedStage && msg.role === 'assistant' && (
                                <button
                                  type="button"
                                  onClick={() =>
                                    selectView(
                                      (msg.suggestedStage === 'root-cause'
                                        ? 'triage'
                                        : msg.suggestedStage) as WorkspaceViewId
                                    )
                                  }
                                  className="cs-btn-secondary text-xs py-1 px-2.5 min-h-[30px] whitespace-nowrap"
                                >
                                  <span>Open {msg.suggestedStage}</span>
                                  <ArrowRight className="w-3 h-3" />
                                </button>
                              )}
                            </div>
                            <p className="text-sm text-ink leading-relaxed whitespace-pre-line">
                              {msg.content}
                            </p>
                            {msg.citations && msg.citations.length > 0 && (
                              <CitationBar
                                ticketIds={msg.citations}
                                ticketsLookup={ticketsLookup}
                                label="Verified citations"
                                maxVisible={3}
                              />
                            )}
                          </div>
                        ))}
                        {isChatting && (
                          <div className="stock-card p-3.5 text-xs text-ink-2 flex items-center gap-2 cs-panel-enter">
                            <RefreshCw className="w-3.5 h-3.5 animate-spin text-paid shrink-0" />
                            <span>
                              Generating grounded reply… ({chatElapsedSec}s · auto-fallback within 8s)
                            </span>
                          </div>
                        )}
                      </div>
                    </PostHogWindow>
                  </div>
                )}

                <div className="max-w-3xl mx-auto flex flex-wrap items-center justify-center gap-2">
                  {[
                    { label: 'Upload Data', view: 'upload' as WorkspaceViewId, icon: Upload },
                    { label: 'Noise & Enrichment', view: 'noise' as WorkspaceViewId, icon: Filter },
                    { label: 'Intent & Clusters', view: 'intent' as WorkspaceViewId, icon: Layers },
                    { label: 'Root Cause & Triage', view: 'triage' as WorkspaceViewId, icon: AlertOctagon },
                    { label: 'Prioritization', view: 'prioritization' as WorkspaceViewId, icon: Calculator },
                    { label: 'PRD Studio', view: 'prd' as WorkspaceViewId, icon: FileCode2 },
                    { label: 'Release Analytics', view: 'validation' as WorkspaceViewId, icon: ActivitySquare },
                    { label: 'Loop Closure', view: 'closure' as WorkspaceViewId, icon: CheckCircle2 },
                  ].map((chip) => {
                    const ChipIcon = chip.icon;
                    return (
                      <button
                        key={chip.view}
                        type="button"
                        onClick={() => selectView(chip.view)}
                        className="cs-btn-secondary text-xs py-1.5 px-3 min-h-[34px] whitespace-nowrap"
                      >
                        <ChipIcon className="w-3.5 h-3.5 text-paid" />
                        <span>{chip.label}</span>
                      </button>
                    );
                  })}
                </div>

                <div className="grid grid-cols-1 md:grid-cols-12 gap-5 pt-2">
                  <div className="md:col-span-7 space-y-3">
                    <div className="text-xs font-semibold text-ink-2 flex items-center gap-1.5">
                      <Sparkles className="w-3.5 h-3.5 text-paid" />
                      <span>Ask CollabSense AI</span>
                    </div>

                    <div className="space-y-2">
                      {[
                        {
                          title: 'Analyze P0/P1 root causes across uploaded tickets',
                          desc: 'Synthesize bottlenecks and supporting evidence citations',
                          prompt: 'What are the highest-severity root causes across my uploaded tickets?',
                        },
                        {
                          title: 'Summarize top customer pain points & quick wins',
                          desc: 'Identify high-impact opportunities aligned with our OKR focus',
                          prompt: 'Summarize the highest-urgency customer issues and quick wins for our roadmap',
                        },
                        {
                          title: 'Compare deterministic RICE vs WSJF rankings',
                          desc: 'Evaluate prioritized clusters with zero LLM math drift',
                          prompt: 'Compare deterministic RICE and WSJF prioritization rankings for our OKR focus',
                        },
                        {
                          title: 'Draft PRD structure for our highest-impact cluster',
                          desc: 'Prepare Gherkin acceptance criteria backed by customer tickets',
                          prompt: 'Draft a Gherkin PRD outline for our top cluster with verified citations',
                        },
                      ].map((item) => (
                        <button
                          key={item.title}
                          type="button"
                          onClick={() => handleSendChatPrompt(item.prompt)}
                          className="w-full text-left p-3 stock-card border border-rule hover:border-paid transition-colors flex items-start gap-3"
                        >
                          <MessageSquare className="w-4 h-4 text-paid shrink-0 mt-0.5" />
                          <div>
                            <div className="font-semibold text-xs text-ink">{item.title}</div>
                            <div className="text-xs text-ink-2">{item.desc}</div>
                          </div>
                        </button>
                      ))}
                    </div>
                  </div>

                  <div className="md:col-span-5 space-y-3">
                    <div className="text-xs font-semibold text-ink-2 flex items-center gap-1.5">
                      <Target className="w-3.5 h-3.5 text-paid" />
                      <span>Pinned project memory</span>
                    </div>

                    <div className="cs-card p-4 space-y-3">
                      <div className="flex items-center justify-between">
                        <span className="font-semibold text-sm text-ink">
                          {activeProject.name}
                        </span>
                        <span className="cs-badge-verified">Active workspace</span>
                      </div>
                      <p className="text-xs text-ink-2 leading-relaxed">
                        {activeProject.description}
                      </p>
                      <div className="p-2.5 rounded-input bg-paper-2 border border-rule-2 text-xs text-ink">
                        <strong>OKR focus:</strong> {activeProject.okr_focus}
                      </div>
                      <div className="grid grid-cols-2 gap-2 text-xs pt-1">
                        <div className="bg-paper border border-rule rounded-input p-2">
                          <div className="text-xs text-muted">Signal tickets</div>
                          <div className="fig font-mono font-semibold text-sm text-ink">
                            {signalTickets.length} / {workspace.tickets.length}
                          </div>
                        </div>
                        <div className="bg-paper border border-rule rounded-input p-2">
                          <div className="text-xs text-muted">Roadmap ready</div>
                          <div className="fig font-mono font-semibold text-sm text-success">
                            {approvedClusters.length} clusters
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* STAGE 1: UPLOAD DATA */}
            {activeView === 'upload' && (() => {
              const PAGE_SIZE = 50;
              const totalPages = Math.max(1, Math.ceil(filteredTickets.length / PAGE_SIZE));
              const safePage = Math.min(uploadPage, totalPages);
              const pageTickets = filteredTickets.slice(
                (safePage - 1) * PAGE_SIZE,
                safePage * PAGE_SIZE
              );

              return (
                <div className="space-y-5">
                  <div className="flex flex-wrap items-center justify-between gap-4">
                    <div>
                      <h1 className="text-xl sm:text-2xl font-bold text-ink">
                        Stage 1: Data Ingestion &amp; Normalization
                      </h1>
                      <p className="text-xs sm:text-sm text-ink-2 mt-0.5">
                        Active batch: <strong className="text-ink">{workspace.batchName}</strong> ·{' '}
                        <span className="fig font-mono font-semibold text-ink">{workspace.tickets.length} rows loaded</span> ·
                        RFC-4180 multi-line CSV &amp; formula-injection protection active.
                      </p>
                    </div>

                    <div className="flex flex-wrap items-center gap-2">
                      <button
                        type="button"
                        onClick={() => setIsIngestModalOpen(true)}
                        className="cs-btn-secondary text-xs whitespace-nowrap"
                      >
                        <Upload className="w-3.5 h-3.5" />
                        <span>Paste / Sample Modal</span>
                      </button>
                      <button
                        type="button"
                        data-testid="run-clustering-btn"
                        onClick={() => handleRunStage2NoiseFilter()}
                        disabled={isRunningStage}
                        className="cs-btn-primary text-xs sm:text-sm whitespace-nowrap"
                      >
                        <Sparkles className="w-4 h-4" />
                        <span>
                          {isRunningStage
                            ? 'Running Stage 2 Noise Filter…'
                            : `Run Stage 2 Noise Filter (${workspace.tickets.length} rows)`}
                        </span>
                      </button>
                    </div>
                  </div>

                  {/* Direct Inline Drop/Upload Zone (supports multi-line quoted CSVs up to 2,000 rows) */}
                  <label className="block border border-dashed border-rule-2 rounded-stock bg-cotton hover:bg-paper-2 transition-colors p-4 cursor-pointer">
                    <div className="flex flex-col sm:flex-row items-center justify-between gap-3">
                      <div className="flex items-center gap-3">
                        <div className="w-9 h-9 rounded-input bg-paper border border-rule flex items-center justify-center shrink-0">
                          <Upload className="w-4 h-4 text-paid" />
                        </div>
                        <div>
                          <div className="text-xs sm:text-sm font-semibold text-ink">
                            Upload CSV or TSV feedback export directly (up to 2,000 rows)
                          </div>
                          <div className="text-xs text-muted">
                            Preserves quoted commas and multi-line cells; auto-detects headers &amp; delimiter
                          </div>
                        </div>
                      </div>
                      <span className="cs-btn-secondary text-xs min-h-[34px] shrink-0">
                        Choose CSV file
                      </span>
                    </div>
                    <input
                      type="file"
                      accept=".csv,.tsv,text/csv,text/tab-separated-values"
                      className="hidden"
                      onChange={(e) => {
                        const file = e.target.files?.[0];
                        if (!file) return;
                        const reader = new FileReader();
                        reader.onload = (ev) => {
                          const text = String(ev.target?.result || '');
                          const diag = parseCsvToTickets(text);
                          if (diag.tickets.length === 0) {
                            setStageError('Uploaded CSV contained 0 valid rows.');
                            return;
                          }
                          setStageError(null);
                          setLastIngestDiagnostics(diag);
                          setSourceFilter('ALL');
                          setUploadPage(1);
                          updateWorkspace((prev) => ({
                            ...prev,
                            batchName: `CSV Upload: ${file.name} (${diag.tickets.length} rows)`,
                            tickets: diag.tickets,
                            enrichedTickets: [],
                            clusters: [],
                            releaseValidations: [],
                            loopClosures: [],
                            prdsByClusterId: {},
                            prdChatsByClusterId: {},
                          }));
                          appendActivity(
                            'Stage 1: Data Ingestion',
                            `Uploaded ${file.name} (${diag.tickets.length} of ${diag.totalDataRows} rows)`,
                            `Content column: ${diag.detectedColumns.content}. Skipped: ${diag.skippedRows}.`,
                            diag.tickets.slice(0, 4).map((t) => t.id)
                          );
                        };
                        reader.readAsText(file);
                        e.target.value = '';
                      }}
                    />
                  </label>

                  {/* Import Diagnostics Verification Banner (Nielsen #1 Visibility of System Status) */}
                  {lastIngestDiagnostics && (
                    <div className="bg-success-soft border border-success rounded-stock p-3 text-xs flex flex-wrap items-center justify-between gap-2">
                      <div className="flex flex-wrap items-center gap-2 text-ink">
                        <CheckCircle2 className="w-4 h-4 text-success shrink-0" />
                        <span>
                          Fetched <strong>{lastIngestDiagnostics.tickets.length}</strong> of{' '}
                          <strong>{lastIngestDiagnostics.totalDataRows}</strong> data rows
                          {lastIngestDiagnostics.skippedRows > 0
                            ? ` (${lastIngestDiagnostics.skippedRows} empty skipped)`
                            : ' (100% captured)'}
                          . Content column: <code className="font-mono">{lastIngestDiagnostics.detectedColumns.content}</code>
                          {lastIngestDiagnostics.sanitizedCount > 0 &&
                            ` · ${lastIngestDiagnostics.sanitizedCount} formula prefixes stripped`}
                          {lastIngestDiagnostics.truncatedAtLimit && ' · Capped at 2,000 rows'}
                        </span>
                      </div>
                      <button
                        type="button"
                        onClick={() => setLastIngestDiagnostics(null)}
                        className="text-muted hover:text-ink"
                        aria-label="Dismiss import summary"
                      >
                        <X className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  )}

                  <PostHogWindow
                    title="Ingested Multi-Channel Feedback Stream"
                    path={`Project: ${activeProject.id}`}
                    badgeText={`${filteredTickets.length} / ${workspace.tickets.length} rows`}
                    badgeVariant="ink"
                  >
                    <div className="space-y-3">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div className="flex flex-wrap gap-1.5">
                          {availableChannels.map((src) => (
                            <button
                              key={src}
                              type="button"
                              onClick={() => {
                                setSourceFilter(src);
                                setUploadPage(1);
                              }}
                              className={`text-xs font-medium px-2.5 py-1 rounded-input border transition-colors ${
                                sourceFilter === src
                                  ? 'bg-board text-board-type border-ink'
                                  : 'bg-paper text-ink-2 border-rule hover:bg-paper-2'
                              }`}
                            >
                              {src}
                            </button>
                          ))}
                        </div>

                        {totalPages > 1 && (
                          <div className="flex items-center gap-2 text-xs">
                            <button
                              type="button"
                              disabled={safePage <= 1}
                              onClick={() => setUploadPage((p) => Math.max(1, p - 1))}
                              className="cs-btn-secondary py-1 px-2 min-h-[28px] text-xs"
                            >
                              Prev
                            </button>
                            <span className="fig font-mono text-muted">
                              Page {safePage}/{totalPages}
                            </span>
                            <button
                              type="button"
                              disabled={safePage >= totalPages}
                              onClick={() => setUploadPage((p) => Math.min(totalPages, p + 1))}
                              className="cs-btn-secondary py-1 px-2 min-h-[28px] text-xs"
                            >
                              Next
                            </button>
                          </div>
                        )}
                      </div>

                      {pageTickets.length === 0 ? (
                        <div className="p-8 text-center text-xs text-muted border border-rule rounded-stock bg-cotton">
                          No feedback rows uploaded yet. Drop a CSV file above or click Paste / Sample Modal.
                        </div>
                      ) : (
                        <div className="max-h-[520px] overflow-y-auto border border-rule rounded-stock divide-y divide-rule bg-cotton">
                          {pageTickets.map((t) => (
                            <div
                              key={t.id}
                              className="p-3 hover:bg-paper transition-colors flex flex-col sm:flex-row sm:items-center justify-between gap-2"
                            >
                              <div className="space-y-1">
                                <div className="flex flex-wrap items-center gap-2 text-xs">
                                  <span className="fig font-mono font-semibold bg-paper-2 text-ink px-1.5 py-0.5 rounded-input border border-rule">
                                    {t.id}
                                  </span>
                                  <span className="font-medium text-ink-2 px-1.5 py-0.5 bg-paper rounded-input border border-rule">
                                    {t.source}
                                  </span>
                                  <span className="text-muted">{t.customer_tier}</span>
                                </div>
                                <p className="text-xs text-ink leading-relaxed">{t.content}</p>
                              </div>
                              {t.arr_weight > 0 && (
                                <span className="fig font-mono text-xs font-semibold text-success shrink-0">
                                  ${(t.arr_weight / 1000).toFixed(0)}k ARR
                                </span>
                              )}
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  </PostHogWindow>
                </div>
              );
            })()}

            {/* STAGE 2: NOISE & ENRICHMENT */}
            {activeView === 'noise' && (() => {
              const PAGE_SIZE = 50;
              const totalPages = Math.max(1, Math.ceil(displayedNoiseStageTickets.length / PAGE_SIZE));
              const safePage = Math.min(noisePage, totalPages);
              const pageItems = displayedNoiseStageTickets.slice(
                (safePage - 1) * PAGE_SIZE,
                safePage * PAGE_SIZE
              );
              const signalPct =
                workspace.enrichedTickets.length > 0
                  ? Math.round((signalTickets.length / workspace.enrichedTickets.length) * 100)
                  : 0;
              const noisePct =
                workspace.enrichedTickets.length > 0 ? 100 - signalPct : 0;

              return (
                <div className="space-y-5">
                  <div className="flex flex-wrap items-center justify-between gap-4">
                    <div>
                      <h1 className="text-xl sm:text-2xl font-bold text-ink">
                        Stage 2: Noise Quarantine &amp; Signal Classification
                      </h1>
                      <p className="text-xs sm:text-sm text-ink-2 mt-1">
                        Separates non-product messages (auto-replies, password resets, routine billing invoices, spam, empty pings) from real product signals across 100% of uploaded rows. Override any classification with 1 click.
                      </p>
                    </div>

                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => handleRunStage2NoiseFilter()}
                        disabled={isRunningStage}
                        className="cs-btn-secondary text-xs whitespace-nowrap"
                      >
                        <RefreshCw className={`w-3.5 h-3.5 ${isRunningStage ? 'animate-spin' : ''}`} />
                        <span>Re-run AI noise filter</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => handleRunStage3Clusters()}
                        disabled={isRunningStage || workspace.enrichedTickets.length === 0}
                        className="cs-btn-primary text-xs whitespace-nowrap"
                      >
                        <span>{isRunningStage ? 'Clustering Signals…' : `Stage 3: Cluster ${signalTickets.length} Signals`}</span>
                        <ArrowRight className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                    <div className="cs-card p-4">
                      <div className="text-xs text-muted">Total processed rows</div>
                      <div className="fig font-mono text-2xl font-semibold text-ink">
                        {workspace.enrichedTickets.length}
                      </div>
                      <div className="text-xs text-ink-2 mt-0.5">
                        100% of Stage 1 rows classified
                      </div>
                    </div>
                    <div className="cs-card p-4">
                      <div className="text-xs text-muted">Verified product signals</div>
                      <div className="fig font-mono text-2xl font-semibold text-success">
                        {signalTickets.length}{' '}
                        <span className="text-sm font-normal text-muted">({signalPct}%)</span>
                      </div>
                      <div className="text-xs text-ink-2 mt-0.5">Actionable for Stage 3 clustering</div>
                    </div>
                    <div className="cs-card p-4">
                      <div className="text-xs text-muted">Quarantined noise</div>
                      <div className="fig font-mono text-2xl font-semibold text-error">
                        {quarantinedNoiseTickets.length}{' '}
                        <span className="text-sm font-normal text-muted">({noisePct}%)</span>
                      </div>
                      <div className="text-xs text-ink-2 mt-0.5">Excluded from roadmap clustering</div>
                    </div>
                  </div>

                  {/* Filters & Noise Category Chips */}
                  <div className="cs-card p-3 flex flex-wrap items-center justify-between gap-3">
                    <div className="flex flex-wrap items-center gap-1.5">
                      {availableNoiseCategories.map((cat) => (
                        <button
                          key={cat}
                          type="button"
                          onClick={() => {
                            setNoiseCategoryFilter(cat);
                            if (cat !== 'ALL') setNoiseFilterMode('NOISE');
                            setNoisePage(1);
                          }}
                          className={`text-xs px-2.5 py-1 rounded-input border font-medium ${
                            noiseCategoryFilter === cat
                              ? 'bg-board text-board-type border-ink'
                              : 'bg-paper border-rule text-ink-2 hover:bg-paper-2'
                          }`}
                        >
                          {cat === 'ALL' ? 'All Noise Reasons' : cat}
                        </button>
                      ))}
                    </div>

                    <div className="relative w-full sm:w-64">
                      <Search className="w-3.5 h-3.5 text-muted absolute left-2.5 top-2.5" />
                      <input
                        type="text"
                        value={noiseSearch}
                        onChange={(e) => {
                          setNoiseSearch(e.target.value);
                          setNoisePage(1);
                        }}
                        placeholder="Search tickets or signal types…"
                        className="cs-input pl-8 py-1 text-xs min-h-[32px]"
                      />
                    </div>
                  </div>

                  <PostHogWindow
                    title="Stage 2 Noise Filter & Account Enrichment Table"
                    badgeText={`${displayedNoiseStageTickets.length} matching`}
                    badgeVariant="green"
                    rightSlot={
                      <div className="flex items-center gap-2">
                        <div className="flex items-center gap-1">
                          {(['ALL', 'SIGNAL', 'NOISE'] as const).map((m) => (
                            <button
                              key={m}
                              type="button"
                              onClick={() => {
                                setNoiseFilterMode(m);
                                if (m !== 'NOISE') setNoiseCategoryFilter('ALL');
                                setNoisePage(1);
                              }}
                              className={`text-xs font-medium px-2.5 py-1 rounded-input border ${
                                noiseFilterMode === m
                                  ? 'bg-paper-2 border-paid text-paid font-semibold'
                                  : 'bg-cotton border-rule text-muted'
                              }`}
                            >
                              {m === 'ALL' ? 'All' : m === 'SIGNAL' ? 'Signals' : 'Noise'}
                            </button>
                          ))}
                        </div>
                        {totalPages > 1 && (
                          <div className="flex items-center gap-1 text-xs">
                            <button
                              type="button"
                              disabled={safePage <= 1}
                              onClick={() => setNoisePage((p) => Math.max(1, p - 1))}
                              className="cs-btn-secondary py-0.5 px-2 min-h-[26px] text-xs"
                            >
                              Prev
                            </button>
                            <span className="fig font-mono text-muted">
                              {safePage}/{totalPages}
                            </span>
                            <button
                              type="button"
                              disabled={safePage >= totalPages}
                              onClick={() => setNoisePage((p) => Math.min(totalPages, p + 1))}
                              className="cs-btn-secondary py-0.5 px-2 min-h-[26px] text-xs"
                            >
                              Next
                            </button>
                          </div>
                        )}
                      </div>
                    }
                  >
                    <div className="divide-y divide-rule">
                      {pageItems.map((t) => (
                        <div
                          key={t.id}
                          className={`p-3 flex flex-col sm:flex-row sm:items-center justify-between gap-3 ${
                            t.is_noise ? 'bg-error-soft' : 'bg-cotton'
                          }`}
                        >
                          <div className="space-y-1 flex-1 min-w-0">
                            <div className="flex flex-wrap items-center gap-2 text-xs">
                              <span className="fig font-mono font-semibold bg-paper-2 px-1.5 py-0.5 rounded-input border border-rule">
                                [{t.id}]
                              </span>
                              {t.is_noise ? (
                                <span className="cs-badge-p0">
                                  {t.noise_category || 'Quarantined noise'}
                                </span>
                              ) : (
                                <>
                                  <span className="cs-badge-verified">Signal</span>
                                  <span className="cs-badge">{t.intent}</span>
                                </>
                              )}
                              {t.urgency && !t.is_noise && (
                                <span className="text-[11px] font-mono text-muted">
                                  Urgency: <strong className="text-ink">{t.urgency}</strong>
                                </span>
                              )}
                              <span className="text-muted">{t.account_context}</span>
                            </div>
                            <p className="text-xs text-ink leading-relaxed">{t.content}</p>
                            {t.noise_reason && (
                              <p className="text-xs text-error">Reason: {t.noise_reason}</p>
                            )}
                          </div>

                          <button
                            type="button"
                            onClick={() => handleOverrideTicketNoise(t.id)}
                            className="cs-btn-secondary text-xs py-1 px-2.5 min-h-[30px] shrink-0"
                            title="Override classification"
                          >
                            {t.is_noise ? 'Restore as Signal' : 'Mark as Noise'}
                          </button>
                        </div>
                      ))}
                    </div>
                  </PostHogWindow>
                </div>
              );
            })()}

            {/* STAGE 3: INTENT & CLUSTERS — SEVERITY HIERARCHY STACK + RICH TAXONOMY */}
            {activeView === 'intent' && (() => {
              const filteredClusters = sortBySeverityHierarchy(
                workspace.clusters.filter(
                  (c) =>
                    (intentFilter === 'ALL' || (c.intent_category || '') === intentFilter) &&
                    (severityFilter === 'ALL' || c.severity === severityFilter)
                )
              ).sort((a, b) => {
                if (intentSortMode === 'reach') {
                  return b.ticket_ids.length - a.ticket_ids.length;
                }
                if (intentSortMode === 'arr') {
                  return b.total_arr_impact - a.total_arr_impact;
                }
                return 0;
              });

              return (
                <div className="space-y-5">
                  <div className="flex flex-wrap items-center justify-between gap-4">
                    <div>
                      <h1 className="text-xl sm:text-2xl font-bold text-ink">
                        Stage 3: Multi-Dimensional Signal Taxonomy &amp; Problem Clusters
                      </h1>
                      <p className="text-xs sm:text-sm text-ink-2 mt-0.5">
                        Groups customer signals across open domain taxonomies ordered top-to-bottom by severity hierarchy (P0 → P4). Click any citation chip or <strong>+N more</strong> to inspect supporting customer tickets.
                      </p>
                    </div>

                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => handleRunStage3Clusters()}
                        disabled={isRunningStage || workspace.tickets.length === 0}
                        className="cs-btn-secondary text-xs whitespace-nowrap"
                      >
                        <RefreshCw className={`w-3.5 h-3.5 ${isRunningStage ? 'animate-spin' : ''}`} />
                        <span>{isRunningStage ? 'Clustering…' : 'Re-cluster with AI'}</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => selectView('triage')}
                        className="cs-btn-primary text-xs whitespace-nowrap"
                      >
                        <span>Stage 4: Root Cause &amp; Triage</span>
                        <ArrowRight className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>

                  {/* Unrestricted Dynamic Taxonomy + Severity + Sort Controls */}
                  <div className="cs-card p-3 space-y-2.5">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="flex flex-wrap items-center gap-1.5">
                        {(['ALL', 'P0', 'P1', 'P2', 'P3', 'P4'] as const).map((sev) => (
                          <button
                            key={sev}
                            type="button"
                            onClick={() => setSeverityFilter(sev)}
                            className={`text-xs font-mono font-semibold px-2.5 py-1 rounded-input border ${
                              severityFilter === sev
                                ? 'bg-board text-board-type border-ink'
                                : 'bg-paper border-rule text-ink-2 hover:bg-paper-2'
                            }`}
                          >
                            {sev === 'ALL' ? 'All Severities' : sev}
                          </button>
                        ))}
                      </div>

                      <select
                        aria-label="Sort clusters"
                        value={intentSortMode}
                        onChange={(e) => setIntentSortMode(e.target.value as typeof intentSortMode)}
                        className="bg-paper border border-rule rounded-input px-2.5 py-1 text-xs text-ink"
                      >
                        <option value="severity">Sort: Severity Hierarchy (P0 → P4)</option>
                        <option value="reach">Sort: Most Mentions</option>
                        <option value="arr">Sort: Highest ARR Impact</option>
                      </select>
                    </div>

                    {availableIntentCategories.length > 1 && (
                      <div className="flex flex-wrap gap-1.5 pt-2 border-t border-rule">
                        {availableIntentCategories.map((cat) => (
                          <button
                            key={cat}
                            type="button"
                            onClick={() => setIntentFilter(cat)}
                            className={`text-xs font-medium px-2.5 py-1 rounded-input border ${
                              intentFilter === cat
                                ? 'bg-paper-2 border-paid text-paid font-semibold'
                                : 'bg-cotton border-rule text-muted hover:text-ink'
                            }`}
                          >
                            {cat === 'ALL' ? 'All Signal Categories' : cat}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>

                  {workspace.clusters.length === 0 && (
                    <div className="cs-card p-6 text-center space-y-3">
                      <p className="text-sm font-semibold text-ink">No problem clusters generated yet</p>
                      <p className="text-xs text-ink-2">
                        {workspace.tickets.length === 0
                          ? 'Upload customer feedback in Stage 1 first.'
                          : `Run AI clustering on your ${signalTickets.length || workspace.tickets.length} verified signal(s) to populate Stages 3 through 8.`}
                      </p>
                      <button
                        type="button"
                        disabled={isRunningStage}
                        onClick={() =>
                          workspace.tickets.length === 0
                            ? selectView('upload')
                            : handleRunStage3Clusters()
                        }
                        className="cs-btn-primary text-xs"
                      >
                        {workspace.tickets.length === 0
                          ? 'Go to Stage 1: Upload Data'
                          : isRunningStage
                          ? 'Clustering Signals…'
                          : 'Run Stage 3 AI Clustering'}
                      </button>
                    </div>
                  )}

                  {/* Vertical Single-Column Hierarchy Stack (One Below the Other) */}
                  <div className="space-y-3.5">
                    {filteredClusters.map((cluster) => {
                      const sevStyle = getSeverityStyle(cluster.severity);
                      return (
                        <div
                          key={cluster.cluster_id}
                          className={`rounded-card border p-4 sm:p-5 space-y-3 ${sevStyle.borderClass} ${sevStyle.surfaceClass}`}
                        >
                          <div className="flex flex-wrap items-start justify-between gap-3">
                            <div className="space-y-1 min-w-0 flex-1">
                              <div className="flex flex-wrap items-center gap-2">
                                <span className={sevStyle.badgeClass}>{sevStyle.label}</span>
                                <span className="fig font-mono text-xs font-semibold text-paid">
                                  {cluster.cluster_id}
                                </span>
                                <span className="cs-badge">{cluster.intent_category || 'Bug / Defect'}</span>
                                {cluster.sub_category && (
                                  <span className="cs-badge">{cluster.sub_category}</span>
                                )}
                                {cluster.product_area && (
                                  <span className="text-xs font-medium bg-paper border border-rule px-2 py-0.5 rounded-input text-ink-2">
                                    Area: {cluster.product_area}
                                  </span>
                                )}
                              </div>
                              <h3 className="font-bold text-base sm:text-lg text-ink">
                                {cluster.theme_title}
                              </h3>
                            </div>

                            <div className="flex flex-wrap items-center gap-2 shrink-0 text-xs fig font-mono">
                              <span className="bg-paper border border-rule px-2.5 py-1 rounded-input font-semibold text-ink">
                                {cluster.ticket_ids.length} ticket(s)
                              </span>
                              {cluster.total_arr_impact > 0 && (
                                <span className="bg-success-soft border border-success text-success px-2.5 py-1 rounded-input font-semibold">
                                  ${(cluster.total_arr_impact / 1000).toFixed(0)}k ARR
                                </span>
                              )}
                            </div>
                          </div>

                          <p className="text-xs sm:text-sm text-ink-2 leading-relaxed">
                            {cluster.problem_summary}
                          </p>

                          {/* Rich Multi-Dimensional Parameters Strip */}
                          <div className="flex flex-wrap items-center gap-2 text-xs text-ink-2">
                            {cluster.affected_persona && (
                              <span className="bg-paper border border-rule px-2 py-0.5 rounded-input">
                                Persona: <strong className="text-ink">{cluster.affected_persona}</strong>
                              </span>
                            )}
                            {cluster.user_journey_stage && (
                              <span className="bg-paper border border-rule px-2 py-0.5 rounded-input">
                                Journey: <strong className="text-ink">{cluster.user_journey_stage}</strong>
                              </span>
                            )}
                            {cluster.churn_risk && (
                              <span className="bg-paper border border-rule px-2 py-0.5 rounded-input">
                                Churn Risk: <strong className="text-ink">{cluster.churn_risk}</strong>
                              </span>
                            )}
                            {cluster.sentiment && (
                              <span className="bg-paper border border-rule px-2 py-0.5 rounded-input">
                                Tone: <strong className="text-ink">{cluster.sentiment}</strong>
                              </span>
                            )}
                            {cluster.suggested_owner && (
                              <span className="bg-paper border border-rule px-2 py-0.5 rounded-input">
                                Owner: <strong className="text-ink">{cluster.suggested_owner}</strong>
                              </span>
                            )}
                            {cluster.tags &&
                              cluster.tags.slice(0, 4).map((tg) => (
                                <span
                                  key={tg}
                                  className="font-mono text-[11px] bg-paper-2 border border-rule px-1.5 py-0.5 rounded-input text-muted"
                                >
                                  #{tg}
                                </span>
                              ))}
                          </div>

                          <div className="pt-2 border-t border-rule flex flex-wrap items-center justify-between gap-3">
                            <CitationBar
                              ticketIds={cluster.ticket_ids}
                              ticketsLookup={ticketsLookup}
                              label="Supporting citations"
                              maxVisible={3}
                            />
                            <button
                              type="button"
                              onClick={() => handleGeneratePrdForCluster(cluster)}
                              className="cs-btn-secondary text-xs py-1 px-2.5 min-h-[30px] shrink-0"
                            >
                              <span>Draft PRD</span>
                              <ArrowRight className="w-3 h-3" />
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })()}

            {/* STAGE 4: ROOT CAUSE & TRIAGE (REDESIGNED HIERARCHY STACK — NO GATE 1 JARGON) */}
            {activeView === 'triage' && (() => {
              const sortedTriage = sortBySeverityHierarchy(workspace.clusters).filter((c) => {
                if (triageFilter === 'ALL') return true;
                return (c.gate1_status || 'PENDING') === triageFilter;
              });
              const needsReviewCount = workspace.clusters.filter(
                (c) => (c.gate1_status || 'PENDING') === 'PENDING'
              ).length;
              const deferredCount = workspace.clusters.filter(
                (c) => c.gate1_status === 'REJECTED'
              ).length;

              return (
                <div className="space-y-5">
                  <div className="flex flex-wrap items-center justify-between gap-4">
                    <div>
                      <h1 className="text-xl sm:text-2xl font-bold text-ink">
                        Stage 4: Root Cause Analysis &amp; Engineering Triage
                      </h1>
                      <p className="text-xs sm:text-sm text-ink-2 mt-1">
                        Diagnose underlying system bottlenecks, calibrate severity (P0 → P4), and promote validated themes onto the prioritization roadmap.
                      </p>
                    </div>

                    <div className="flex flex-wrap items-center gap-2">
                      {workspace.clusters.length > 0 && (
                        <button
                          type="button"
                          onClick={handleMarkAllHighPriorityReady}
                          className="cs-btn-secondary text-xs whitespace-nowrap"
                        >
                          <ShieldCheck className="w-3.5 h-3.5 text-success" />
                          <span>Mark all P0/P1 Ready</span>
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={() => selectView('prioritization')}
                        className="cs-btn-primary text-xs whitespace-nowrap"
                      >
                        <span>Prioritize {approvedClusters.length} Ready Items</span>
                        <ArrowRight className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>

                  {/* Triage Status Filter Bar */}
                  {workspace.clusters.length > 0 && (
                    <div className="cs-card p-3 flex flex-wrap items-center justify-between gap-3 text-xs">
                      <div className="flex flex-wrap items-center gap-1.5">
                        {(
                          [
                            { id: 'ALL', label: `All (${workspace.clusters.length})` },
                            { id: 'APPROVED', label: `Ready for Roadmap (${approvedClusters.length})` },
                            { id: 'PENDING', label: `Needs Review (${needsReviewCount})` },
                            { id: 'REJECTED', label: `Deferred (${deferredCount})` },
                          ] as const
                        ).map((tab) => (
                          <button
                            key={tab.id}
                            type="button"
                            onClick={() => setTriageFilter(tab.id)}
                            className={`px-3 py-1 rounded-input border font-medium ${
                              triageFilter === tab.id
                                ? 'bg-board text-board-type border-ink'
                                : 'bg-paper border-rule text-ink-2 hover:bg-paper-2'
                            }`}
                          >
                            {tab.label}
                          </button>
                        ))}
                      </div>
                      <button
                        type="button"
                        onClick={() => handleRunStage4RootCauseTriage()}
                        disabled={isRunningStage}
                        className="cs-btn-secondary py-1 px-2.5 min-h-[30px] text-xs"
                      >
                        <RefreshCw className={`w-3 h-3 ${isRunningStage ? 'animate-spin' : ''}`} />
                        <span>Refresh Root Cause AI</span>
                      </button>
                    </div>
                  )}

                  {workspace.clusters.length === 0 && (
                    <div className="cs-card p-6 text-center space-y-3">
                      <p className="text-sm font-semibold text-ink">No clusters ready for root cause triage yet</p>
                      <p className="text-xs text-ink-2">
                        Upload customer feedback in Stage 1 and run AI clustering to inspect root causes and assign roadmap readiness.
                      </p>
                      <button
                        type="button"
                        disabled={isRunningStage}
                        onClick={() =>
                          workspace.tickets.length === 0
                            ? selectView('upload')
                            : handleRunStage4RootCauseTriage()
                        }
                        className="cs-btn-primary text-xs"
                      >
                        {workspace.tickets.length === 0
                          ? 'Go to Stage 1: Upload Data'
                          : isRunningStage
                          ? 'Analyzing root causes…'
                          : 'Run Stage 4 Root Cause Triage'}
                      </button>
                    </div>
                  )}

                  {/* Vertical Single-Column Severity Hierarchy Cards (One Below Another) */}
                  <div className="space-y-4">
                    {sortedTriage.map((cluster) => {
                      const status = cluster.gate1_status || 'PENDING';
                      const sevStyle = getSeverityStyle(cluster.severity);
                      return (
                        <div
                          key={cluster.cluster_id}
                          data-testid={`gate1-card-${cluster.cluster_id}`}
                          className={`rounded-card border p-4 sm:p-5 space-y-3.5 ${sevStyle.borderClass} ${sevStyle.surfaceClass}`}
                        >
                          <div className="flex flex-wrap items-start justify-between gap-3">
                            <div className="space-y-1 min-w-0 flex-1">
                              <div className="flex flex-wrap items-center gap-2">
                                <span className={sevStyle.badgeClass}>{sevStyle.label}</span>
                                <span className="fig font-mono text-xs font-semibold text-paid">
                                  {cluster.cluster_id}
                                </span>
                                <span className="cs-badge">{cluster.intent_category || 'Bug / Defect'}</span>
                                {cluster.churn_risk && (
                                  <span className="text-xs font-mono text-muted">
                                    Churn: <strong className="text-ink">{cluster.churn_risk}</strong>
                                  </span>
                                )}
                              </div>
                              <h3 className="font-bold text-base sm:text-lg text-ink">
                                {cluster.theme_title}
                              </h3>
                            </div>

                            {/* Clean Triage Controls (Severity Override + Decision Segmented Control) */}
                            <div className="flex flex-wrap items-center gap-2 shrink-0">
                              <select
                                aria-label={`Severity for ${cluster.cluster_id}`}
                                value={cluster.severity}
                                onChange={(e) =>
                                  handleSeverityOverride(cluster.cluster_id, e.target.value as SeverityLevel)
                                }
                                className="bg-paper border border-rule rounded-input px-2 py-1 text-xs font-mono font-semibold text-ink"
                              >
                                <option value="P0">P0 · Critical</option>
                                <option value="P1">P1 · High</option>
                                <option value="P2">P2 · Moderate</option>
                                <option value="P3">P3 · Low</option>
                                <option value="P4">P4 · Backlog</option>
                              </select>

                              <span
                                data-testid={`gate1-status-${cluster.cluster_id}`}
                                className="sr-only"
                              >
                                {status}
                              </span>

                              <div className="flex items-center gap-1 p-1 stock-groove text-xs">
                                <button
                                  type="button"
                                  data-testid={`gate1-approve-${cluster.cluster_id}`}
                                  onClick={() => handleGate1Decision(cluster.cluster_id, 'APPROVED')}
                                  className={`px-2.5 py-1 rounded-input font-semibold inline-flex items-center gap-1 transition-colors ${
                                    status === 'APPROVED'
                                      ? 'bg-success text-cotton'
                                      : 'text-ink-2 hover:text-ink'
                                  }`}
                                >
                                  {status === 'APPROVED' && <Check className="w-3 h-3" />}
                                  <span>Ready for Roadmap</span>
                                </button>
                                <button
                                  type="button"
                                  onClick={() => handleGate1Decision(cluster.cluster_id, 'PENDING')}
                                  className={`px-2.5 py-1 rounded-input font-medium transition-colors ${
                                    status === 'PENDING'
                                      ? 'stock-card text-ink font-semibold'
                                      : 'text-muted hover:text-ink'
                                  }`}
                                >
                                  Needs Review
                                </button>
                                <button
                                  type="button"
                                  data-testid={`gate1-reject-${cluster.cluster_id}`}
                                  onClick={() => handleGate1Decision(cluster.cluster_id, 'REJECTED')}
                                  className={`px-2.5 py-1 rounded-input font-medium transition-colors ${
                                    status === 'REJECTED'
                                      ? 'bg-error text-cotton font-semibold'
                                      : 'text-muted hover:text-ink'
                                  }`}
                                >
                                  Deferred
                                </button>
                              </div>
                            </div>
                          </div>

                          <div className="grid grid-cols-1 lg:grid-cols-2 gap-3 text-xs">
                            <div className="bg-paper border border-rule rounded-input p-3 space-y-1">
                              <div className="text-xs font-semibold text-ink-2">
                                Problem Summary
                              </div>
                              <p className="text-ink leading-relaxed">{cluster.problem_summary}</p>
                            </div>
                            <div className="bg-paper border border-rule rounded-input p-3 space-y-1.5">
                              <div className="flex flex-wrap items-center justify-between gap-2">
                                <div className="text-xs font-semibold text-paid">
                                  Root Cause Synthesis
                                </div>
                                <div className="flex items-center gap-2 text-muted">
                                  {cluster.product_area && (
                                    <span>
                                      Area: <strong className="text-ink">{cluster.product_area}</strong>
                                    </span>
                                  )}
                                  {cluster.suggested_owner && (
                                    <span>
                                      · Owner: <strong className="text-ink">{cluster.suggested_owner}</strong>
                                    </span>
                                  )}
                                </div>
                              </div>
                              <p className="text-ink leading-relaxed">{cluster.root_cause}</p>
                              {cluster.workaround_available && (
                                <div className="text-xs text-muted pt-1 border-t border-rule">
                                  Workaround: <span className="text-ink">{cluster.workaround_available}</span>
                                </div>
                              )}
                            </div>
                          </div>

                          <div className="flex flex-wrap items-center justify-between gap-2 pt-1 border-t border-rule">
                            <CitationBar
                              ticketIds={cluster.ticket_ids}
                              ticketsLookup={ticketsLookup}
                              label="Supporting citations"
                              maxVisible={3}
                            />
                            {cluster.total_arr_impact > 0 && (
                              <span className="fig font-mono text-xs font-semibold text-success">
                                Attributed ARR: ${cluster.total_arr_impact.toLocaleString()}
                              </span>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })()}

            {/* STAGE 5: PRIORITIZATION — TOP-TO-BOTTOM RANKED STACK */}
            {activeView === 'prioritization' && (() => {
              const visibleRanked = workspace.clusters
                .filter((c) => c.gate1_status !== 'REJECTED')
                .filter((c) => !quickWinsOnly || (c.impact_score >= 2.0 && c.effort_score <= 2.5));

              const getPrimaryMetric = (c: TriageCluster): number => {
                if (framework === 'WSJF') return c.computed_wsjf;
                if (framework === 'ICE') return c.computed_ice;
                return c.computed_rice;
              };
              const topScore = Math.max(...visibleRanked.map(getPrimaryMetric), 1);
              const quickWinsCount = workspace.clusters.filter(
                (c) => c.gate1_status !== 'REJECTED' && c.impact_score >= 2.0 && c.effort_score <= 2.5
              ).length;
              const mustCount = workspace.clusters.filter(
                (c) => c.gate1_status !== 'REJECTED' && c.moscow_tag === 'MUST'
              ).length;

              return (
                <div className="space-y-5">
                  <div className="flex flex-wrap items-center justify-between gap-4">
                    <div>
                      <h1 className="text-xl sm:text-2xl font-bold text-ink">
                        Stage 5: Top-to-Bottom Roadmap Prioritization Stack
                      </h1>
                      <p className="text-xs sm:text-sm text-ink-2 mt-0.5">
                        Ordered strictly from highest priority (#1) down using pure deterministic scoring math ({approvedClusters.length} roadmap-ready, {visibleRanked.length} active).
                      </p>
                    </div>

                    <div className="flex flex-wrap items-center gap-2">
                      <button
                        type="button"
                        onClick={() => setQuickWinsOnly((q) => !q)}
                        className={`text-xs font-semibold px-3 py-1.5 rounded-input border ${
                          quickWinsOnly
                            ? 'bg-success-soft border-success text-success'
                            : 'bg-cotton border-rule text-ink-2 hover:bg-paper-2'
                        }`}
                      >
                        Quick Wins Only ({quickWinsCount})
                      </button>

                      <div className="flex flex-wrap gap-1 p-1 stock-groove">
                        {(['RICE', 'WSJF', 'ICE', 'MOSCOW', 'KANO'] as PrioritizationFramework[]).map(
                          (fw) => (
                            <button
                              key={fw}
                              type="button"
                              data-testid={`fw-${fw}`}
                              onClick={() => handleFrameworkSwitch(fw)}
                              className={`font-mono text-xs font-semibold px-3 py-1.5 rounded-input transition-colors ${
                                framework === fw
                                  ? 'stock-card text-paid'
                                  : 'text-ink-2 hover:text-ink'
                              }`}
                            >
                              {fw}
                            </button>
                          )
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Top Priority Summary KPIs */}
                  {visibleRanked.length > 0 && (
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3.5">
                      <div className="cs-card p-3.5">
                        <div className="text-xs text-muted">#1 Highest Priority ({framework})</div>
                        <div className="font-bold text-sm text-ink truncate mt-0.5">
                          {visibleRanked[0].theme_title}
                        </div>
                        <div className="fig font-mono text-xs font-semibold text-paid mt-1">
                          Score: {framework === 'MOSCOW' ? visibleRanked[0].moscow_tag : framework === 'KANO' ? visibleRanked[0].kano_category : getPrimaryMetric(visibleRanked[0])}
                        </div>
                      </div>
                      <div className="cs-card p-3.5">
                        <div className="text-xs text-muted">Must-Build Initiatives</div>
                        <div className="fig font-mono text-xl font-bold text-ink mt-0.5">{mustCount}</div>
                        <div className="text-xs text-ink-2">MoSCoW MUST threshold met</div>
                      </div>
                      <div className="cs-card p-3.5">
                        <div className="text-xs text-muted">High-Impact Quick Wins</div>
                        <div className="fig font-mono text-xl font-bold text-success mt-0.5">
                          {quickWinsCount}
                        </div>
                        <div className="text-xs text-ink-2">Impact ≥ 2.0 &amp; Effort ≤ 2.5m</div>
                      </div>
                    </div>
                  )}

                  <div className="bg-board text-board-type rounded-stock p-3 font-mono text-xs flex flex-wrap items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <Terminal className="w-4 h-4 text-accent" />
                      <span>Deterministic formula:</span>
                      <strong className="text-accent">
                        {framework === 'RICE' &&
                          'RICE = (Reach × Impact × Confidence) / max(Effort, 0.1)'}
                        {framework === 'WSJF' && 'WSJF = Cost_of_Delay / max(Job_Duration, 1)'}
                        {framework === 'ICE' && 'ICE = (Impact_10 × Confidence_10 × Ease) / 10'}
                        {framework === 'MOSCOW' &&
                          'MoSCoW = MUST (RICE >= 10) > SHOULD (>= 5) > COULD (>= 2) > WONT'}
                        {framework === 'KANO' &&
                          'Kano = Must-Be > Performance Feature > Attractive / Delighter > Indifferent'}
                      </strong>
                    </div>
                    <span className="text-success-soft font-semibold">0.00% LLM math drift</span>
                  </div>

                  {workspace.clusters.length === 0 ? (
                    <div className="cs-card p-6 text-center space-y-3">
                      <p className="text-sm font-semibold text-ink">No clusters ready for prioritization yet</p>
                      <p className="text-xs text-ink-2">
                        Upload feedback in Stage 1 and run Stage 3 clustering to score clusters cleanly.
                      </p>
                      <button
                        type="button"
                        onClick={() =>
                          workspace.tickets.length === 0 ? selectView('upload') : handleRunStage3Clusters()
                        }
                        className="cs-btn-primary text-xs"
                      >
                        {workspace.tickets.length === 0
                          ? 'Go to Stage 1: Upload Data'
                          : 'Generate Clusters Now'}
                      </button>
                    </div>
                  ) : (
                    <div className="space-y-4">
                      {visibleRanked.map((c, idx) => {
                        const isTopThree = idx < 3;
                        const isWeightsOpen = expandedWeightsIds[c.cluster_id] ?? idx === 0;
                        const primaryVal = getPrimaryMetric(c);
                        const barPct = Math.max(8, Math.round((primaryVal / topScore) * 100));
                        const sevStyle = getSeverityStyle(c.severity);

                        return (
                          <React.Fragment key={c.cluster_id}>
                            {idx === 0 && (
                              <div className="text-xs font-semibold uppercase tracking-wider text-paid flex items-center gap-2">
                                <span>Top Priority Sprint Focus (Ranks #1 – #3)</span>
                              </div>
                            )}
                            {idx === 3 && (
                              <div className="text-xs font-semibold uppercase tracking-wider text-muted pt-2 border-t border-rule">
                                Backlog Queue (Ranks #4+)
                              </div>
                            )}
                            <div
                              data-testid={`matrix-row-${c.cluster_id}`}
                              className={`rounded-card border p-4 space-y-3 ${
                                isTopThree
                                  ? 'border-2 border-accent-active bg-cotton'
                                  : 'border-rule bg-paper opacity-95'
                              }`}
                            >
                              <div className="flex flex-wrap items-start justify-between gap-3">
                                <div className="flex items-start gap-3 min-w-0 flex-1">
                                  <span
                                    className={`w-8 h-8 rounded-input fig font-mono text-xs font-bold flex items-center justify-center shrink-0 ${
                                      isTopThree
                                        ? 'bg-board text-accent'
                                        : 'bg-paper-2 border border-rule text-ink'
                                    }`}
                                  >
                                    #{idx + 1}
                                  </span>
                                  <div className="space-y-1 min-w-0 flex-1">
                                    <div className="flex flex-wrap items-center gap-2">
                                      <span className={sevStyle.badgeClass}>{c.severity}</span>
                                      <span className="fig font-mono text-xs font-semibold text-paid">
                                        {c.cluster_id}
                                      </span>
                                      <span className="cs-badge">{c.intent_category || 'Bug / Defect'}</span>
                                      {c.gate1_status === 'APPROVED' && (
                                        <span className="cs-badge-verified">Roadmap Ready</span>
                                      )}
                                      {c.impact_score >= 2.0 && c.effort_score <= 2.5 && (
                                        <span className="stamp-settled text-[11px]">Quick Win</span>
                                      )}
                                    </div>
                                    <h3 className="font-bold text-sm sm:text-base text-ink">
                                      {c.theme_title}
                                    </h3>
                                  </div>
                                </div>

                                {/* Score Pill Stack */}
                                <div className="flex flex-wrap items-center gap-2 fig font-mono text-xs shrink-0">
                                  <div className="bg-paper-2 border border-paid text-ink rounded-input px-2.5 py-1 font-bold">
                                    RICE:{' '}
                                    <span data-testid={`rice-score-${c.cluster_id}`} className="text-paid">
                                      {c.computed_rice}
                                    </span>
                                  </div>
                                  <div className="bg-cotton border border-rule rounded-input px-2 py-1">
                                    WSJF: {c.computed_wsjf}
                                  </div>
                                  <div className="bg-cotton border border-rule rounded-input px-2 py-1">
                                    ICE: {c.computed_ice}
                                  </div>
                                  <div className="bg-paper border border-rule rounded-input px-2 py-1 font-semibold">
                                    {c.moscow_tag}
                                  </div>
                                  <button
                                    type="button"
                                    data-testid={`generate-prd-btn-${c.cluster_id}`}
                                    onClick={() => handleGeneratePrdForCluster(c)}
                                    className="cs-btn-primary text-xs py-1 px-3 min-h-[32px] whitespace-nowrap"
                                  >
                                    <span>Draft PRD</span>
                                    <ArrowRight className="w-3 h-3" />
                                  </button>
                                </div>
                              </div>

                              {/* Relative Priority Bar vs #1 */}
                              <div className="flex items-center gap-3 text-xs">
                                <div className="flex-1 bg-paper-2 border border-rule rounded-input h-2 overflow-hidden">
                                  <div
                                    className={`h-full rounded-input transition-all ${
                                      isTopThree ? 'bg-paid' : 'bg-ink-2'
                                    }`}
                                    style={{ width: `${barPct}%` }}
                                  />
                                </div>
                                <span className="fig font-mono text-[11px] text-muted shrink-0">
                                  {c.kano_category} · {c.effort_score.toFixed(1)}m effort
                                  {c.total_arr_impact > 0 ? ` · $${(c.total_arr_impact / 1000).toFixed(0)}k ARR` : ''}
                                </span>
                              </div>

                              <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
                                <CitationBar
                                  ticketIds={c.ticket_ids}
                                  ticketsLookup={ticketsLookup}
                                  label="Evidence"
                                  maxVisible={3}
                                />
                                <button
                                  type="button"
                                  onClick={() =>
                                    setExpandedWeightsIds((prev) => ({
                                      ...prev,
                                      [c.cluster_id]: !isWeightsOpen,
                                    }))
                                  }
                                  className="cs-btn-secondary text-xs py-1 px-2.5 min-h-[30px]"
                                >
                                  <SlidersHorizontal className="w-3 h-3" />
                                  <span>{isWeightsOpen ? 'Hide weights' : 'Adjust weights'}</span>
                                  {isWeightsOpen ? (
                                    <ChevronUp className="w-3 h-3" />
                                  ) : (
                                    <ChevronDown className="w-3 h-3" />
                                  )}
                                </button>
                              </div>

                              {isWeightsOpen && (
                                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-4 pt-3 border-t border-rule text-xs cs-panel-enter">
                                  <div>
                                    <div className="flex justify-between font-medium mb-1">
                                      <span>Reach</span>
                                      <span className="fig font-mono">{c.reach_count}</span>
                                    </div>
                                    <input
                                      type="range"
                                      min={1}
                                      max={250}
                                      step={1}
                                      aria-label={`Reach slider for ${c.cluster_id}`}
                                      value={c.reach_count}
                                      onChange={(e) =>
                                        handleClusterSliderChange(c.cluster_id, 'reach_count', Number(e.target.value))
                                      }
                                      className="ph-slider w-full"
                                    />
                                  </div>

                                  <div>
                                    <div className="flex justify-between font-medium mb-1">
                                      <span>Impact</span>
                                      <span className="fig font-mono">{c.impact_score.toFixed(1)}</span>
                                    </div>
                                    <input
                                      type="range"
                                      min={0.5}
                                      max={3.0}
                                      step={0.1}
                                      aria-label={`Impact slider for ${c.cluster_id}`}
                                      value={c.impact_score}
                                      onChange={(e) =>
                                        handleClusterSliderChange(c.cluster_id, 'impact_score', Number(e.target.value))
                                      }
                                      className="ph-slider w-full"
                                    />
                                  </div>

                                  <div>
                                    <div className="flex justify-between font-medium mb-1">
                                      <span>Confidence</span>
                                      <span className="fig font-mono">{Math.round(c.confidence_score * 100)}%</span>
                                    </div>
                                    <input
                                      type="range"
                                      min={0.1}
                                      max={1.0}
                                      step={0.05}
                                      aria-label={`Confidence slider for ${c.cluster_id}`}
                                      value={c.confidence_score}
                                      onChange={(e) =>
                                        handleClusterSliderChange(c.cluster_id, 'confidence_score', Number(e.target.value))
                                      }
                                      className="ph-slider w-full"
                                    />
                                  </div>

                                  <div>
                                    <div className="flex justify-between font-medium mb-1">
                                      <span>Effort</span>
                                      <span className="fig font-mono">{c.effort_score.toFixed(1)}m</span>
                                    </div>
                                    <input
                                      type="range"
                                      min={0.5}
                                      max={5.0}
                                      step={0.5}
                                      aria-label={`Effort slider for ${c.cluster_id}`}
                                      value={c.effort_score}
                                      onChange={(e) =>
                                        handleClusterSliderChange(c.cluster_id, 'effort_score', Number(e.target.value))
                                      }
                                      className="ph-slider w-full"
                                    />
                                  </div>

                                  <div>
                                    <div className="flex justify-between font-medium mb-1">
                                      <span>WSJF CoD</span>
                                      <span className="fig font-mono">{c.wsjf_cod}</span>
                                    </div>
                                    <input
                                      type="range"
                                      min={1}
                                      max={30}
                                      step={1}
                                      aria-label={`WSJF CoD slider for ${c.cluster_id}`}
                                      value={c.wsjf_cod}
                                      onChange={(e) =>
                                        handleClusterSliderChange(c.cluster_id, 'wsjf_cod', Number(e.target.value))
                                      }
                                      className="ph-slider w-full"
                                    />
                                  </div>

                                  <div>
                                    <div className="flex justify-between font-medium mb-1">
                                      <span>ICE Ease</span>
                                      <span className="fig font-mono">{Number(c.ice_ease).toFixed(1)}</span>
                                    </div>
                                    <input
                                      type="range"
                                      min={1.0}
                                      max={10.0}
                                      step={0.5}
                                      aria-label={`ICE Ease slider for ${c.cluster_id}`}
                                      value={c.ice_ease}
                                      onChange={(e) =>
                                        handleClusterSliderChange(c.cluster_id, 'ice_ease', Number(e.target.value))
                                      }
                                      className="ph-slider w-full"
                                    />
                                  </div>
                                </div>
                              )}
                            </div>
                          </React.Fragment>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            })()}

            {/* STAGE 6: INTERACTIVE PRD STUDIO & LIVE VIEWER */}
            {activeView === 'prd' && (
              <PRDStudioView
                clusters={workspace.clusters}
                selectedClusterId={selectedClusterId}
                onSelectClusterId={(id) => setSelectedClusterId(id)}
                activePrd={activePrd}
                editableMarkdown={editableMarkdown}
                onEditableMarkdownChange={(nextMd) => {
                  setEditableMarkdown(nextMd);
                  if (activePrd && selectedCluster) {
                    const updatedPrd: GeneratedPRD = {
                      ...activePrd,
                      markdown_body: nextMd,
                    };
                    setActivePrd(updatedPrd);
                    updateWorkspace((prev) => ({
                      ...prev,
                      prdsByClusterId: {
                        ...(prev.prdsByClusterId || {}),
                        [selectedCluster.cluster_id]: updatedPrd,
                      },
                    }));
                  }
                }}
                pmNotes={pmNotes}
                onPmNotesChange={setPmNotes}
                isRunningStage={isRunningStage}
                onSynthesizePrd={handleGeneratePrdForCluster}
                onApplyChatPrdUpdate={handleApplyChatPrdUpdate}
                chatHistory={
                  selectedCluster
                    ? workspace.prdChatsByClusterId?.[selectedCluster.cluster_id] || []
                    : []
                }
                ticketsLookup={ticketsLookup}
                apiBase={API_BASE}
                getAuthHeaders={getAuthHeaders}
                projectName={activeProject.name}
                okrFocus={activeProject.okr_focus}
                onCopyMarkdown={handleCopyMarkdown}
                copiedMd={copiedMd}
                onDownloadMarkdown={handleDownloadMarkdown}
                onExportLinear={handleExportLinear}
                linearExportResult={linearExportResult}
                onGoToStage={(view) => selectView(view)}
              />
            )}

            {/* STAGE 7: RELEASE ANALYTICS BOARD */}
            {activeView === 'validation' && (
              <ReleaseAnalyticsView
                validations={workspace.releaseValidations}
                tickets={workspace.tickets}
                enrichedTickets={workspace.enrichedTickets}
                ticketsLookup={ticketsLookup}
                validatingClusterId={validatingClusterId}
                onUpdateField={handleUpdateReleaseValidationField}
                onAddMonitor={handleAddCustomReleaseMonitor}
                onValidateWithAi={(rv, thresholdPct, cohortWindow) =>
                  handleValidateReleaseCluster(
                    rv,
                    `${cohortWindow} telemetry check (spike threshold >+${thresholdPct}%): ${rv.regression_summary}`
                  )
                }
                onGoToUpload={() => selectView('upload')}
                onRunClustering={() => handleRunStage3Clusters()}
                onGoToClosure={() => selectView('closure')}
              />
            )}

            {/* STAGE 8: DECLUTTERED LOOP CLOSURE */}
            {activeView === 'closure' && (
              <LoopClosureView
                loopClosures={workspace.loopClosures}
                hasClusters={workspace.clusters.length > 0}
                hasTickets={workspace.tickets.length > 0}
                ticketsLookup={ticketsLookup}
                isGeneratingLoops={isGeneratingLoops}
                copiedDraftId={copiedDraftId}
                onGenerateAllAi={handleGenerateLoopClosuresAI}
                onUpdateDraft={handleUpdateLoopClosureDraft}
                onStatusChange={handleLoopClosureStatusChange}
                onCopyDraft={handleCopyLoopClosureDraft}
                onGoToUpload={() => selectView('upload')}
                onRunClustering={() => handleRunStage3Clusters()}
              />
            )}

            {/* PROJECT SETTINGS: ACTIVITY LOG */}
            {activeView === 'activity' && (
              <div className="space-y-5">
                <div>
                  <h1 className="text-xl sm:text-2xl font-semibold text-ink">
                    Project Activity and Citation Audit Trail ({activeProject.name})
                  </h1>
                </div>

                <PostHogWindow
                  title="Project Activity Stream"
                  path={`Project: ${activeProject.id}`}
                  badgeText={`${workspace.activityLog.length} events`}
                  badgeVariant="ink"
                >
                  <div className="divide-y divide-rule">
                    {workspace.activityLog.map((act) => (
                      <div key={act.id} className="py-3 space-y-1">
                        <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
                          <div className="flex items-center gap-2">
                            <span className="font-semibold text-paid">{act.stage}</span>
                            <strong className="text-ink">{act.action}</strong>
                          </div>
                          <span className="fig font-mono text-muted">
                            {act.actor} ({act.timestamp.slice(0, 19).replace('T', ' ')})
                          </span>
                        </div>
                        <p className="text-xs text-ink-2">{act.detail}</p>
                        {act.citations.length > 0 && (
                          <div className="flex flex-wrap items-center gap-1 pt-1">
                            {act.citations.map((cid) => (
                              <span key={cid} className="cs-badge-verified">
                                [{cid}]
                              </span>
                            ))}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </PostHogWindow>
              </div>
            )}

            {/* PROJECT SETTINGS: COLLAB */}
            {activeView === 'collab' && (
              <div className="space-y-5">
                <div>
                  <h1 className="text-xl sm:text-2xl font-semibold text-ink">
                    Manage Project Members ({activeProject.name})
                  </h1>
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-start">
                  <div className="lg:col-span-7">
                    <PostHogWindow
                      title="Active Project Members"
                      badgeText={`${workspace.members.length} members`}
                      badgeVariant="green"
                    >
                      <div className="divide-y divide-rule">
                        {workspace.members.map((m) => (
                          <div
                            key={m.id}
                            className="py-3 flex items-center justify-between gap-3 text-xs"
                          >
                            <div>
                              <div className="font-semibold text-ink">{m.fullName}</div>
                              <div className="font-mono text-muted">{m.email}</div>
                            </div>
                            <div className="flex items-center gap-2">
                              <span className="bg-paper-2 border border-rule px-2 py-0.5 rounded-input font-medium">
                                {m.role}
                              </span>
                              <span className="cs-badge-verified">{m.status}</span>
                            </div>
                          </div>
                        ))}
                      </div>
                    </PostHogWindow>
                  </div>

                  <div className="lg:col-span-5">
                    <PostHogWindow
                      title="Invite Teammate to Project"
                      badgeText="Team access"
                      badgeVariant="yellow"
                    >
                      <form onSubmit={handleInviteMember} className="space-y-3">
                        <div>
                          <label htmlFor="invite-email" className="block text-xs font-medium text-ink mb-1">
                            Teammate work email
                          </label>
                          <input
                            id="invite-email"
                            type="email"
                            required
                            value={inviteEmail}
                            onChange={(e) => setInviteEmail(e.target.value)}
                            placeholder="pm.peer@company.com"
                            className="cs-input"
                          />
                        </div>
                        <div>
                          <label htmlFor="invite-role" className="block text-xs font-medium text-ink mb-1">
                            Project role
                          </label>
                          <select
                            id="invite-role"
                            value={inviteRole}
                            onChange={(e) =>
                              setInviteRole(e.target.value as 'editor' | 'viewer')
                            }
                            className="cs-input text-xs"
                          >
                            <option value="editor">Editor (Can triage issues and edit PRDs)</option>
                            <option value="viewer">Viewer (Read-only stakeholder access)</option>
                          </select>
                        </div>
                        <button type="submit" className="w-full cs-btn-primary text-xs py-2 whitespace-nowrap">
                          <UserPlus className="w-3.5 h-3.5" />
                          <span>Invite to {activeProject.name}</span>
                        </button>
                      </form>
                    </PostHogWindow>
                  </div>
                </div>
              </div>
            )}
          </div>
        </main>

        {/* Pinned Bottom 8-Stage Progression Bar */}
        <footer className="shrink-0 bg-cotton border-t border-rule px-4 sm:px-6 py-2.5 flex flex-wrap items-center justify-between gap-3 z-20">
          <div className="flex items-center gap-3">
            <span className="fig font-mono text-xs font-semibold bg-paper-2 border border-rule px-2.5 py-1 rounded-input text-ink">
              Stage {Math.max(activeStepIndex, 0)} of 8
            </span>
            <span className="text-xs text-ink-2 hidden sm:inline">
              Project: <strong className="text-ink">{activeProject.name}</strong>
            </span>
          </div>

          <div className="flex items-center gap-2">
            {prevStep && (
              <button
                type="button"
                onClick={() => selectView(prevStep.id)}
                className="cs-btn-secondary text-xs py-1.5 whitespace-nowrap"
              >
                <ArrowLeft className="w-3.5 h-3.5" />
                <span>Prev: {prevStep.label}</span>
              </button>
            )}
            {nextStep ? (
              <button
                type="button"
                onClick={() => selectView(nextStep.id)}
                className="cs-btn-primary text-xs py-1.5 whitespace-nowrap"
              >
                <span>Next: {nextStep.label}</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </button>
            ) : (
              <button
                type="button"
                onClick={() => selectView('home')}
                className="cs-btn-secondary text-xs py-1.5 whitespace-nowrap"
              >
                Return to Home Co-Pilot
              </button>
            )}
          </div>
        </footer>
      </div>

      <IngestionModal
        isOpen={isIngestModalOpen}
        onClose={() => setIsIngestModalOpen(false)}
        onIngestTickets={(newTickets, label, diag) => {
          handleRunStage2NoiseFilter(newTickets, label, diag);
        }}
      />
    </div>
  );
};
