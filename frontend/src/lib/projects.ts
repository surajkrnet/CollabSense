import {
  FeedbackCluster,
  GeneratedPRD,
  RawTicket,
} from './calculators';
import { supabase, isSupabaseConfigured } from './supabase';

// Unrestricted dynamic classification taxonomy
export type IntentCategory = string;

export interface EnrichedTicket extends RawTicket {
  is_noise: boolean;
  noise_category?: string | null;
  noise_reason?: string | null;
  intent: IntentCategory;
  urgency?: 'Critical' | 'High' | 'Medium' | 'Low';
  account_context: string;
}

export interface TriageCluster extends FeedbackCluster {
  intent_category?: IntentCategory;
  product_area?: string;
  root_cause?: string;
  workaround_available?: string;
  gate1_status?: 'PENDING' | 'APPROVED' | 'REJECTED';
  gate1_notes?: string;
  verified_citations?: string[];
  sub_category?: string;
  affected_persona?: string;
  user_journey_stage?: string;
  churn_risk?: 'Critical' | 'High' | 'Medium' | 'Low';
  sentiment?: 'Urgent / Blocking' | 'Frustrated' | 'Neutral' | 'Constructive';
  tags?: string[];
  suggested_owner?: string;
}

export interface ReleaseValidationItem {
  cluster_id: string;
  theme_title: string;
  release_tag: string;
  pre_release_daily_tickets: number;
  post_release_daily_tickets: number;
  delta_pct: number;
  spike_detected: boolean;
  verdict: 'VERIFIED_RESOLVED' | 'MONITORING' | 'REGRESSION_SPIKE';
  regression_summary: string;
  citations: string[];
  feature_flag?: string;
  rollout_pct?: number;
  cohort_window?: string;
  owner_notes?: string;
}

export interface LoopClosureDraftItem {
  draft_id: string;
  cluster_id: string;
  theme_title: string;
  channel: 'Zendesk' | 'Discord' | 'Email' | 'Linear';
  recipient_segment: string;
  cited_tickets: string[];
  subject: string;
  message_body: string;
  internal_playbook_note?: string;
  status: 'DRAFT' | 'APPROVED_TO_SEND' | 'SENT';
}

export interface PRDChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  changedSections?: string[];
  modelUsed?: string;
  latencyMs?: number;
  timestamp: string;
}

export interface ActivityLogEntry {
  id: string;
  timestamp: string;
  actor: string;
  stage: string;
  action: string;
  detail: string;
  citations: string[];
}

export interface ProjectMember {
  id: string;
  email: string;
  fullName: string;
  role: 'owner' | 'editor' | 'viewer';
  status: 'active' | 'invited';
  joinedAt: string;
}

export interface ChatMessageItem {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  citations: string[];
  suggestedStage?: string;
  modelUsed?: string;
  latencyMs?: number;
  timestamp: string;
}

export interface CollabSenseProject {
  id: string;
  name: string;
  description: string;
  okr_focus: string;
  createdAt: string;
  ownerEmail: string;
}

export interface ProjectWorkspaceData {
  projectId: string;
  batchName: string;
  tickets: RawTicket[];
  enrichedTickets: EnrichedTicket[];
  clusters: TriageCluster[];
  releaseValidations: ReleaseValidationItem[];
  loopClosures: LoopClosureDraftItem[];
  prdsByClusterId?: Record<string, GeneratedPRD>;
  prdChatsByClusterId?: Record<string, PRDChatMessage[]>;
  activityLog: ActivityLogEntry[];
  members: ProjectMember[];
  chatMessages: ChatMessageItem[];
}

const PROJECTS_LIST_KEY = 'collabsense_v5_projects_list';
const ACTIVE_PROJECT_KEY = 'collabsense_v5_active_project_id';
const WORKSPACE_PREFIX = 'collabsense_v5_workspace_';

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isUuid(value: string): boolean {
  return UUID_REGEX.test(value);
}

export const DEFAULT_PROJECTS: CollabSenseProject[] = [];

export function enrichTicketDeterministically(t: RawTicket): EnrichedTicket {
  const text = t.content.toLowerCase();
  let noiseCategory: string | null = null;
  const hasProductCue =
    text.includes('bug') ||
    text.includes('error') ||
    text.includes('crash') ||
    text.includes('500') ||
    text.includes('403') ||
    text.includes('timeout') ||
    text.includes('feature') ||
    text.includes('export') ||
    text.includes('api') ||
    text.includes('webhook') ||
    text.includes('slow') ||
    text.includes('missing');

  if (text.includes('out of office') || text.includes('on vacation') || text.includes('auto-reply')) {
    noiseCategory = 'Auto-Reply / OOO';
  } else if (text.includes('unsubscribe') || text.includes('opt out')) {
    noiseCategory = 'Unsubscribe / Opt-Out';
  } else if (text.includes('test ping') || text.includes('asdf')) {
    noiseCategory = 'Test / Gibberish';
  } else if (text.includes('spam') || text.includes('crypto airdrop')) {
    noiseCategory = 'Spam / Promotional';
  } else if ((text.includes('reset my password') || text.includes('forgot my password')) && !hasProductCue) {
    noiseCategory = 'Password / Login Reset';
  } else if ((text.includes('send a copy of our invoice') || text.includes('billing invoice copy')) && !hasProductCue) {
    noiseCategory = 'Billing / Invoice Routine';
  }

  const isNoise = Boolean(noiseCategory);
  let intent: IntentCategory = 'Feature Request';
  let urgency: 'Critical' | 'High' | 'Medium' | 'Low' =
    t.customer_tier === 'Enterprise' ? 'High' : 'Medium';

  if (isNoise) {
    intent = 'Noise';
    urgency = 'Low';
  } else if (text.includes('saml') || text.includes('scim') || text.includes('okta') || text.includes('soc2') || text.includes('rbac') || text.includes('audit')) {
    intent = 'Security & Compliance';
    urgency = 'Critical';
  } else if (text.includes('webhook') || text.includes('api') || text.includes('linear') || text.includes('jira') || text.includes('slack') || text.includes('sync')) {
    intent = 'Integration & API';
    urgency = 'High';
  } else if (text.includes('csv') || text.includes('export') || text.includes('import') || text.includes('utf-8')) {
    intent = 'Data & Export/Import';
    urgency = 'High';
  } else if (text.includes('timeout') || text.includes('504') || text.includes('freeze') || text.includes('slow') || text.includes('latency')) {
    intent = 'Performance & Latency';
    urgency = 'High';
  } else if (text.includes('403') || text.includes('crash') || text.includes('500') || text.includes('fail') || text.includes('error') || text.includes('bug')) {
    intent = 'Bug / Defect';
    urgency = t.customer_tier === 'Enterprise' ? 'Critical' : 'High';
  } else if (text.includes('mobile') || text.includes('ios') || text.includes('android') || text.includes('offline')) {
    intent = 'Mobile & Cross-Platform';
  } else if (text.includes('dashboard') || text.includes('analytics') || text.includes('report')) {
    intent = 'Analytics & Reporting';
  } else if (text.includes('onboarding') || text.includes('setup') || text.includes('docs')) {
    intent = 'Onboarding & Activation';
  } else if (text.includes('viewport') || text.includes('slider') || text.includes('swipe') || text.includes('ui') || text.includes('ux')) {
    intent = 'UI/UX Friction';
  }

  const tierContextMap: Record<string, string> = {
    Enterprise: 'Enterprise SLA',
    'Mid-Market': 'Mid-Market Growth',
    Pro: 'Self-Serve Pro',
    Standard: 'Standard Tier',
    Free: 'Community Free Tier',
  };

  const baseTier = tierContextMap[t.customer_tier] || 'Standard Tier';
  return {
    ...t,
    is_noise: isNoise,
    noise_category: noiseCategory,
    noise_reason: isNoise
      ? `Non-product ${noiseCategory?.toLowerCase() || 'noise'} quarantined at Stage 2.`
      : null,
    intent,
    urgency,
    account_context:
      t.arr_weight > 0 ? `${baseTier} ($${t.arr_weight.toLocaleString()} ARR)` : baseTier,
  };
}

export function hydrateTriageClusters(clusters: FeedbackCluster[]): TriageCluster[] {
  return clusters.map((c) => {
    const existing = c as TriageCluster;
    return {
      ...c,
      intent_category: existing.intent_category || 'Bug / Defect',
      root_cause:
        existing.root_cause ||
        `Root bottleneck identified across ${c.ticket_ids.length} verified customer citations.`,
      gate1_status:
        existing.gate1_status || (c.severity === 'P0' || c.severity === 'P1' ? 'APPROVED' : 'PENDING'),
      verified_citations: existing.verified_citations || c.ticket_ids,
      sub_category: existing.sub_category || '',
      affected_persona: existing.affected_persona || '',
      user_journey_stage: existing.user_journey_stage || '',
      churn_risk: existing.churn_risk || (c.severity === 'P0' ? 'Critical' : c.severity === 'P1' ? 'High' : 'Medium'),
      sentiment: existing.sentiment || (c.severity === 'P0' ? 'Urgent / Blocking' : 'Frustrated'),
      tags: existing.tags || [],
      suggested_owner: existing.suggested_owner || '',
    };
  });
}

/** Dynamically generates Stage 7 Release Validation and Stage 8 Loop Closure records from uploaded clusters. */
export function buildDownstreamStagesFromClusters(clusters: TriageCluster[]): {
  releaseValidations: ReleaseValidationItem[];
  loopClosures: LoopClosureDraftItem[];
} {
  const releaseValidations: ReleaseValidationItem[] = clusters.map((c, idx) => {
    const preRate = Math.max(1.0, Number((c.ticket_ids.length * 0.6).toFixed(1)));
    return {
      cluster_id: c.cluster_id,
      theme_title: c.theme_title,
      release_tag: `v1.${idx + 1}.0-pending`,
      pre_release_daily_tickets: preRate,
      post_release_daily_tickets: preRate,
      delta_pct: 0,
      spike_detected: false,
      verdict: 'MONITORING',
      regression_summary: `Awaiting release deployment to compare post-release ticket volume against baseline (${c.ticket_ids.length} cited tickets).`,
      citations: c.ticket_ids,
      feature_flag: `ff_${c.cluster_id.toLowerCase().replace(/[^a-z0-9]+/g, '_')}_fix`,
      rollout_pct: 0,
      cohort_window: '7d Post-Release',
    };
  });

  const validLoopChannels = new Set(['Zendesk', 'Discord', 'Email', 'Linear']);
  const loopClosures: LoopClosureDraftItem[] = clusters.map((c, idx) => {
    const rawChan = c.channels?.[0] || 'Email';
    const safeChan = (validLoopChannels.has(rawChan) ? rawChan : 'Email') as
      | 'Zendesk'
      | 'Discord'
      | 'Email'
      | 'Linear';
    const arrSuffix =
      c.total_arr_impact > 0
        ? ` ($${Math.round(c.total_arr_impact / 1000)}k ARR)`
        : '';
    return {
      draft_id: idx < 9 ? `LC-0${idx + 1}` : `LC-${idx + 1}`,
      cluster_id: c.cluster_id,
      theme_title: c.theme_title,
      channel: safeChan,
      recipient_segment: `${c.ticket_ids.length} affected customer ticket(s)${arrSuffix}`,
      cited_tickets: c.ticket_ids,
      subject: `[Update] ${c.theme_title}`,
      message_body: `Hi team — we have analyzed your reported feedback (${c.ticket_ids.slice(0, 5).map((id) => `[${id}]`).join(', ')}) regarding ${c.theme_title}. ${c.problem_summary}`,
      internal_playbook_note: `Support & Sales Playbook: ${c.theme_title} (${c.cluster_id}) tracked against ${c.ticket_ids.slice(0, 5).map((id) => `[${id}]`).join(', ')}.`,
      status: 'DRAFT',
    };
  });

  return { releaseValidations, loopClosures };
}

/** Initializes a completely blank project workspace with zero pre-loaded demo data. */
export function buildDefaultWorkspaceData(project: CollabSenseProject): ProjectWorkspaceData {
  return {
    projectId: project.id,
    batchName: 'No data uploaded yet',
    tickets: [],
    enrichedTickets: [],
    clusters: [],
    releaseValidations: [],
    loopClosures: [],
    prdsByClusterId: {},
    prdChatsByClusterId: {},
    activityLog: [],
    members: [
      {
        id: 'MEM-OWNER',
        email: project.ownerEmail,
        fullName: project.ownerEmail.split('@')[0] || 'Project Owner',
        role: 'owner',
        status: 'active',
        joinedAt: project.createdAt.slice(0, 10),
      },
    ],
    chatMessages: [],
  };
}

export function getSavedProjects(): CollabSenseProject[] {
  try {
    const raw = localStorage.getItem(PROJECTS_LIST_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as CollabSenseProject[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function getActiveProjectId(): string {
  const saved = localStorage.getItem(ACTIVE_PROJECT_KEY);
  const projects = getSavedProjects();
  if (saved && projects.some((p) => p.id === saved)) {
    return saved;
  }
  return projects[0]?.id || 'new';
}

export function setActiveProjectId(projectId: string): void {
  localStorage.setItem(ACTIVE_PROJECT_KEY, projectId);
}

/** Fetches the signed-in user's projects from Supabase Postgres. */
export async function fetchProjectsFromSupabase(ownerEmail: string): Promise<{
  projects: CollabSenseProject[];
  syncedFromDb: boolean;
}> {
  if (!isSupabaseConfigured || !supabase) {
    return { projects: getSavedProjects(), syncedFromDb: false };
  }
  try {
    const { data, error } = await supabase
      .from('projects')
      .select('id, name, description, okr_focus, created_at')
      .order('created_at', { ascending: false });

    if (error || !data) {
      return { projects: getSavedProjects(), syncedFromDb: false };
    }

    const mapped: CollabSenseProject[] = data.map((row) => ({
      id: String(row.id),
      name: String(row.name),
      description: String(row.description || ''),
      okr_focus: String(row.okr_focus || ''),
      createdAt: String(row.created_at || new Date().toISOString()),
      ownerEmail,
    }));

    localStorage.setItem(PROJECTS_LIST_KEY, JSON.stringify(mapped));
    return { projects: mapped, syncedFromDb: true };
  } catch {
    return { projects: getSavedProjects(), syncedFromDb: false };
  }
}

export async function createNewProject(input: {
  name: string;
  description: string;
  okr_focus: string;
  ownerEmail: string;
}): Promise<CollabSenseProject> {
  const cleanName = input.name.trim();
  const cleanDesc = input.description.trim() || 'Project-scoped product discovery & triage workspace.';
  const cleanOkr = input.okr_focus.trim() || 'Prioritize validated customer feedback with verified citations';

  let createdProject: CollabSenseProject | null = null;

  if (isSupabaseConfigured && supabase) {
    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const authUser = sessionData.session?.user;
      if (authUser) {
        const { data: inserted, error } = await supabase
          .from('projects')
          .insert({
            owner_id: authUser.id,
            name: cleanName,
            description: cleanDesc,
            okr_focus: cleanOkr,
          })
          .select('id, name, description, okr_focus, created_at')
          .single();

        if (!error && inserted?.id) {
          createdProject = {
            id: String(inserted.id),
            name: String(inserted.name),
            description: String(inserted.description || ''),
            okr_focus: String(inserted.okr_focus || ''),
            createdAt: String(inserted.created_at || new Date().toISOString()),
            ownerEmail: input.ownerEmail,
          };

          const blankWs = buildDefaultWorkspaceData(createdProject);
          await Promise.allSettled([
            supabase.from('project_members').insert({
              project_id: createdProject.id,
              user_id: authUser.id,
              invited_email: input.ownerEmail,
              role: 'owner',
              status: 'active',
            }),
            supabase.from('project_workspaces').upsert({
              project_id: createdProject.id,
              batch_name: blankWs.batchName,
              state: blankWs,
              updated_at: new Date().toISOString(),
            }),
          ]);
        }
      }
    } catch {
      // Fall back to local project creation if needed
    }
  }

  if (!createdProject) {
    const slug = cleanName
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '')
      .slice(0, 24);
    createdProject = {
      id: `proj-${slug || 'workspace'}-${Date.now().toString().slice(-4)}`,
      name: cleanName,
      description: cleanDesc,
      okr_focus: cleanOkr,
      createdAt: new Date().toISOString(),
      ownerEmail: input.ownerEmail,
    };
  }

  const existing = getSavedProjects().filter((p) => p.id !== createdProject!.id);
  const updated = [createdProject, ...existing];
  localStorage.setItem(PROJECTS_LIST_KEY, JSON.stringify(updated));
  setActiveProjectId(createdProject.id);

  const initialWorkspace = buildDefaultWorkspaceData(createdProject);
  saveProjectWorkspaceData(createdProject.id, initialWorkspace);

  return createdProject;
}

export async function deleteProjectById(projectId: string): Promise<CollabSenseProject[]> {
  if (isSupabaseConfigured && supabase && isUuid(projectId)) {
    try {
      await supabase.from('projects').delete().eq('id', projectId);
    } catch {
      // Ignore if offline
    }
  }
  const remaining = getSavedProjects().filter((p) => p.id !== projectId);
  localStorage.setItem(PROJECTS_LIST_KEY, JSON.stringify(remaining));
  localStorage.removeItem(`${WORKSPACE_PREFIX}${projectId}`);
  if (getActiveProjectId() === projectId && remaining[0]) {
    setActiveProjectId(remaining[0].id);
  }
  return remaining;
}

export function loadProjectWorkspaceData(projectId: string): ProjectWorkspaceData {
  const projects = getSavedProjects();
  const project = projects.find((p) => p.id === projectId) || projects[0] || {
    id: projectId,
    name: 'Untitled Project',
    description: '',
    okr_focus: '',
    createdAt: new Date().toISOString(),
    ownerEmail: '',
  };
  try {
    const raw = localStorage.getItem(`${WORKSPACE_PREFIX}${project.id}`);
    if (raw) {
      return JSON.parse(raw) as ProjectWorkspaceData;
    }
  } catch {
    // Fallback to blank project workspace
  }
  const built = buildDefaultWorkspaceData(project);
  saveProjectWorkspaceData(project.id, built);
  return built;
}

/** Loads the latest persisted 8-stage workspace state from Supabase Postgres. */
export async function fetchProjectWorkspaceFromSupabase(
  project: CollabSenseProject
): Promise<ProjectWorkspaceData> {
  const localFallback = loadProjectWorkspaceData(project.id);
  if (!isSupabaseConfigured || !supabase || !isUuid(project.id)) {
    return localFallback;
  }
  try {
    const { data, error } = await supabase
      .from('project_workspaces')
      .select('state')
      .eq('project_id', project.id)
      .maybeSingle();

    if (error || !data?.state || typeof data.state !== 'object') {
      return localFallback;
    }

    const remote = data.state as Partial<ProjectWorkspaceData>;
    const hydrated: ProjectWorkspaceData = {
      ...buildDefaultWorkspaceData(project),
      ...remote,
      projectId: project.id,
    };
    localStorage.setItem(`${WORKSPACE_PREFIX}${project.id}`, JSON.stringify(hydrated));
    return hydrated;
  } catch {
    return localFallback;
  }
}

export function saveProjectWorkspaceData(projectId: string, data: ProjectWorkspaceData): void {
  try {
    localStorage.setItem(`${WORKSPACE_PREFIX}${projectId}`, JSON.stringify(data));
  } catch {
    // Ignore storage quota errors
  }

  if (isSupabaseConfigured && supabase && isUuid(projectId)) {
    void supabase
      .from('project_workspaces')
      .upsert({
        project_id: projectId,
        batch_name: data.batchName,
        state: data,
        updated_at: new Date().toISOString(),
      })
      .then(() => undefined, () => undefined);
  }
}

export async function logActivityToSupabase(
  projectId: string,
  entry: ActivityLogEntry
): Promise<void> {
  if (!isSupabaseConfigured || !supabase || !isUuid(projectId)) return;
  try {
    await supabase.from('activity_log').insert({
      project_id: projectId,
      actor_email: entry.actor,
      stage: entry.stage,
      action: entry.action,
      detail: entry.detail,
      citations: entry.citations,
    });
  } catch {
    // Non-blocking audit log write
  }
}

export async function saveChatMessageToSupabase(
  projectId: string,
  msg: ChatMessageItem
): Promise<void> {
  if (!isSupabaseConfigured || !supabase || !isUuid(projectId)) return;
  try {
    await supabase.from('chat_messages').insert({
      project_id: projectId,
      role: msg.role,
      content: msg.content,
      citations: msg.citations,
      triggered_stage: msg.suggestedStage || null,
      model_used: msg.modelUsed || null,
    });
  } catch {
    // Non-blocking chat write
  }
}

export async function saveTriageReviewToSupabase(
  projectId: string,
  clusterId: string,
  decision: 'APPROVED' | 'REJECTED' | 'PENDING',
  reviewerEmail: string,
  citations: string[]
): Promise<void> {
  if (!isSupabaseConfigured || !supabase || !isUuid(projectId)) return;
  try {
    const { data } = await supabase.auth.getSession();
    await supabase.from('triage_reviews').insert({
      project_id: projectId,
      cluster_id: clusterId,
      reviewer_id: data.session?.user?.id || null,
      reviewer_email: reviewerEmail,
      decision,
      citations,
    });
  } catch {
    // Non-blocking triage review write
  }
}

export async function inviteMemberToSupabase(
  projectId: string,
  member: ProjectMember
): Promise<void> {
  if (!isSupabaseConfigured || !supabase || !isUuid(projectId)) return;
  try {
    await supabase.from('project_members').upsert(
      {
        project_id: projectId,
        invited_email: member.email,
        role: member.role,
        status: member.status,
      },
      { onConflict: 'project_id,invited_email' }
    );
  } catch {
    // Non-blocking member invite write
  }
}
