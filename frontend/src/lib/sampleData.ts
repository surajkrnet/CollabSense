import {
  FeedbackCluster,
  GeneratedPRD,
  RawTicket,
  recalculateAndSortClusters,
} from './calculators';

export const SAMPLE_30_TICKETS: RawTicket[] = [
  // Theme 1: Enterprise SAML SSO & Okta SCIM Provisioning (8 tickets)
  {
    id: 'TCK-101',
    source: 'Zendesk',
    customer_tier: 'Enterprise',
    arr_weight: 145000,
    content:
      'Okta SAML 2.0 assertion fails with 403 InvalidAudience when our security team enforces strict IdP-initiated login across 400 seats.',
    created_at: '2026-11-10T08:14:00Z',
  },
  {
    id: 'TCK-102',
    source: 'Zendesk',
    customer_tier: 'Enterprise',
    arr_weight: 98000,
    content:
      'SCIM deprovisioning from Azure AD does not revoke active JWT refresh tokens immediately; terminated contractors still see roadmap boards for 24h.',
    created_at: '2026-11-10T09:30:00Z',
  },
  {
    id: 'TCK-103',
    source: 'Linear',
    customer_tier: 'Enterprise',
    arr_weight: 120000,
    content:
      "[SEC-ESC] Okta group attribute mapping drops 'Product_Lead' role claim and downgrades VPs to Read-Only viewer on every re-login.",
    created_at: '2026-11-10T11:05:00Z',
  },
  {
    id: 'TCK-104',
    source: 'Zendesk',
    customer_tier: 'Mid-Market',
    arr_weight: 48000,
    content:
      'We cannot pass our SOC2 Type II audit unless SAML JIT provisioning automatically assigns users to their regional workspace.',
    created_at: '2026-11-10T13:20:00Z',
  },
  {
    id: 'TCK-105',
    source: 'Discord',
    customer_tier: 'Enterprise',
    arr_weight: 85000,
    content:
      'Anyone else hitting an infinite redirect loop between `/login` and Google Workspace SAML when third-party cookies are blocked in Brave?',
    created_at: '2026-11-10T14:55:00Z',
  },
  {
    id: 'TCK-106',
    source: 'Linear',
    customer_tier: 'Enterprise',
    arr_weight: 110000,
    content:
      'Multi-domain SSO support needed: our parent company uses `@acme-global.com` and subsidiary uses `@acme-labs.io` on the same Okta tenant.',
    created_at: '2026-11-10T16:10:00Z',
  },
  {
    id: 'TCK-107',
    source: 'Zendesk',
    customer_tier: 'Enterprise',
    arr_weight: 160000,
    content:
      'CISO blocked our Q4 expansion of 250 PM seats until SCIM 2.0 group sync and forced SAML session TTL (8 hours) are live.',
    created_at: '2026-11-10T17:40:00Z',
  },
  {
    id: 'TCK-108',
    source: 'Zendesk',
    customer_tier: 'Mid-Market',
    arr_weight: 52000,
    content:
      'SAML metadata XML upload rejects certificates with SHA-512 signatures; we had to manually paste the x509 string via support.',
    created_at: '2026-11-10T19:00:00Z',
  },

  // Theme 2: CSV & Webhook Bulk Ingestion Timeouts / Encoding Bugs (7 tickets)
  {
    id: 'TCK-109',
    source: 'Zendesk',
    customer_tier: 'Mid-Market',
    arr_weight: 42000,
    content:
      'Uploading a 5,000-row Zendesk export CSV freezes the browser tab at 68% and returns a 504 Gateway Timeout after 30 seconds.',
    created_at: '2026-11-11T07:25:00Z',
  },
  {
    id: 'TCK-110',
    source: 'Discord',
    customer_tier: 'Pro',
    arr_weight: 18000,
    content:
      'When a customer starts a bullet point with `-` or `+` in Discord feedback, the CSV parser flags it as formula injection and drops the entire line!',
    created_at: '2026-11-11T08:50:00Z',
  },
  {
    id: 'TCK-111',
    source: 'Linear',
    customer_tier: 'Enterprise',
    arr_weight: 95000,
    content:
      'UTF-8 BOM exports from Excel on Windows scramble German umlauts and Japanese characters in `raw_tickets.content` during batch upload.',
    created_at: '2026-11-11T10:15:00Z',
  },
  {
    id: 'TCK-112',
    source: 'Zendesk',
    customer_tier: 'Mid-Market',
    arr_weight: 38000,
    content:
      'Webhook ingestion endpoint `/api/v1/ingest` drops Intercom bursts when >50 events fire in the same second—need async queue buffering.',
    created_at: '2026-11-11T11:45:00Z',
  },
  {
    id: 'TCK-113',
    source: 'Discord',
    customer_tier: 'Pro',
    arr_weight: 15000,
    content:
      'Multi-line quoted strings inside CSV cells with embedded commas split a single customer rant into 4 corrupted ghost tickets.',
    created_at: '2026-11-11T13:10:00Z',
  },
  {
    id: 'TCK-114',
    source: 'Linear',
    customer_tier: 'Mid-Market',
    arr_weight: 46000,
    content:
      'Need background chunked streaming for CSV batches >250 rows with a live progress bar instead of synchronous HTTP blocking.',
    created_at: '2026-11-11T15:05:00Z',
  },
  {
    id: 'TCK-115',
    source: 'Zendesk',
    customer_tier: 'Enterprise',
    arr_weight: 88000,
    content:
      'Duplicate ticket detection fails when Zendesk and Salesforce sync the same customer escalation 5 minutes apart with slightly different headers.',
    created_at: '2026-11-11T16:30:00Z',
  },

  // Theme 3: Linear & Jira Bi-Directional Status Sync & Gherkin Formatting (6 tickets)
  {
    id: 'TCK-116',
    source: 'Linear',
    customer_tier: 'Enterprise',
    arr_weight: 105000,
    content:
      'Exporting a PRD to Linear creates the parent epic, but Gherkin `Given/When/Then` scenarios aren’t split into child sub-issues automatically.',
    created_at: '2026-11-11T18:00:00Z',
  },
  {
    id: 'TCK-117',
    source: 'Discord',
    customer_tier: 'Pro',
    arr_weight: 24000,
    content:
      'When engineers move a Linear issue to `Done`, CollabSense still shows the cluster status as `In Triage`—we need two-way webhook sync.',
    created_at: '2026-11-11T19:20:00Z',
  },
  {
    id: 'TCK-118',
    source: 'Linear',
    customer_tier: 'Mid-Market',
    arr_weight: 54000,
    content:
      'RICE score and customer verbatim quotes are stripped when syncing to Jira Cloud custom fields; engineers lose all customer context.',
    created_at: '2026-11-11T20:45:00Z',
  },
  {
    id: 'TCK-119',
    source: 'Discord',
    customer_tier: 'Pro',
    arr_weight: 19000,
    content:
      'Re-exporting an edited PRD from HITL Studio creates a duplicate Linear ticket instead of updating the existing linked `linear_issue_url`.',
    created_at: '2026-11-12T06:15:00Z',
  },
  {
    id: 'TCK-120',
    source: 'Zendesk',
    customer_tier: 'Enterprise',
    arr_weight: 92000,
    content:
      'Our staff engineers want the deterministic RICE breakdown table embedded directly inside the Linear issue Markdown description.',
    created_at: '2026-11-12T07:50:00Z',
  },
  {
    id: 'TCK-121',
    source: 'Linear',
    customer_tier: 'Mid-Market',
    arr_weight: 41000,
    content:
      'Support mapping CollabSense `P0/P1/P2` severity directly to Linear `Urgent/High/Medium` priority integers during GraphQL mutation.',
    created_at: '2026-11-12T09:10:00Z',
  },

  // Theme 4: Mobile AppStore Offline Cache & Deep-Link Crash on iOS/Android (5 tickets)
  {
    id: 'TCK-122',
    source: 'AppStore',
    customer_tier: 'Pro',
    arr_weight: 14000,
    content:
      '1-Star iOS 18: Tapping a Slack push notification for a newly generated PRD crashes the mobile webview to a blank white screen.',
    created_at: '2026-11-12T10:30:00Z',
  },
  {
    id: 'TCK-123',
    source: 'AppStore',
    customer_tier: 'Standard',
    arr_weight: 9000,
    content:
      'Dragging the RICE calibration sliders on iPad Safari triggers accidental horizontal page back-swipe instead of updating Effort score.',
    created_at: '2026-11-12T11:55:00Z',
  },
  {
    id: 'TCK-124',
    source: 'AppStore',
    customer_tier: 'Mid-Market',
    arr_weight: 36000,
    content:
      'On commuter train Wi-Fi drops, unsaved edits in the HITL Markdown PRD editor vanish completely because IndexedDB local caching is missing.',
    created_at: '2026-11-12T13:40:00Z',
  },
  {
    id: 'TCK-125',
    source: 'Discord',
    customer_tier: 'Pro',
    arr_weight: 21000,
    content:
      'Android Chrome viewport cuts off the right half of the Multi-Framework Decision Matrix table; needs horizontal scroll lock on mobile.',
    created_at: '2026-11-12T15:10:00Z',
  },
  {
    id: 'TCK-126',
    source: 'AppStore',
    customer_tier: 'Standard',
    arr_weight: 12000,
    content:
      'FaceID re-authentication prompt loops 3 times every morning when opening CollabSense PWA from the iOS home screen.',
    created_at: '2026-11-12T16:25:00Z',
  },

  // Theme 5: Executive Read-Only Board Portals & Audit Trail Exports (4 tickets)
  {
    id: 'TCK-127',
    source: 'Zendesk',
    customer_tier: 'Enterprise',
    arr_weight: 135000,
    content:
      'VP of Product needs a passwordless Read-Only share link for the Now/Next/Later Roadmap so board members cannot drag RICE sliders.',
    created_at: '2026-11-12T17:45:00Z',
  },
  {
    id: 'TCK-128',
    source: 'Linear',
    customer_tier: 'Enterprise',
    arr_weight: 115000,
    content:
      "Need an immutable audit log showing which PM overrode Gemini's qualitative Impact estimate from 1.5 to 3.0 before QBR sign-off.",
    created_at: '2026-11-12T19:00:00Z',
  },
  {
    id: 'TCK-129',
    source: 'Zendesk',
    customer_tier: 'Mid-Market',
    arr_weight: 49000,
    content:
      'Customer Success managers want a dedicated portal view to see which problem cluster their account’s Zendesk ticket (`TCK-xxx`) was mapped into.',
    created_at: '2026-11-12T20:15:00Z',
  },
  {
    id: 'TCK-130',
    source: 'Zendesk',
    customer_tier: 'Enterprise',
    arr_weight: 128000,
    content:
      'Compliance requires exporting a monthly CSV/PDF snapshot of all PRD revisions alongside their deterministic RICE and WSJF formulas.',
    created_at: '2026-11-12T21:30:00Z',
  },
];

export const INITIAL_CLUSTERS: FeedbackCluster[] = recalculateAndSortClusters(
  [
    {
      cluster_id: 'CLU-01',
      theme_title: 'Enterprise SAML 2.0 SSO & Okta SCIM Group Provisioning',
      problem_summary:
        'Enterprise security teams face SAML assertion failures, stale JWT sessions on SCIM deprovisioning, and dropped RBAC role claims across multi-domain IdP tenants.',
      severity: 'P0',
      ticket_ids: [
        'TCK-101',
        'TCK-102',
        'TCK-103',
        'TCK-104',
        'TCK-105',
        'TCK-106',
        'TCK-107',
        'TCK-108',
      ],
      representative_quotes: [
        'Okta SAML 2.0 assertion fails with 403 InvalidAudience when our security team enforces strict IdP-initiated login across 400 seats.',
        'SCIM deprovisioning from Azure AD does not revoke active JWT refresh tokens immediately; terminated contractors still see roadmap boards for 24h.',
        'CISO blocked our Q4 expansion of 250 PM seats until SCIM 2.0 group sync and forced SAML session TTL (8 hours) are live.',
      ],
      channels: ['Discord', 'Linear', 'Zendesk'],
      total_arr_impact: 818000,
      reach_count: 8,
      impact_score: 2.9,
      confidence_score: 0.95,
      effort_score: 2.0,
      wsjf_cod: 28,
      wsjf_duration: 2,
      ice_ease: 7.5,
      kano_category: 'Must-Be',
      computed_rice: 11.02,
      computed_wsjf: 14.0,
      computed_ice: 68.88,
      moscow_tag: 'MUST',
    },
    {
      cluster_id: 'CLU-02',
      theme_title: 'Async Chunked CSV & High-Burst Webhook Ingestion Pipeline',
      problem_summary:
        'Large multi-thousand-row CSV exports and Intercom/Zendesk webhook bursts trigger 504 timeouts, UTF-8 BOM encoding corruption, and over-aggressive bullet-point stripping.',
      severity: 'P0',
      ticket_ids: [
        'TCK-109',
        'TCK-110',
        'TCK-111',
        'TCK-112',
        'TCK-113',
        'TCK-114',
        'TCK-115',
      ],
      representative_quotes: [
        'Uploading a 5,000-row Zendesk export CSV freezes the browser tab at 68% and returns a 504 Gateway Timeout after 30 seconds.',
        'When a customer starts a bullet point with `-` or `+` in Discord feedback, the CSV parser flags it as formula injection and drops the entire line!',
        'UTF-8 BOM exports from Excel on Windows scramble German umlauts and Japanese characters in `raw_tickets.content` during batch upload.',
      ],
      channels: ['Discord', 'Linear', 'Zendesk'],
      total_arr_impact: 342000,
      reach_count: 7,
      impact_score: 2.6,
      confidence_score: 0.92,
      effort_score: 1.5,
      wsjf_cod: 24,
      wsjf_duration: 2,
      ice_ease: 8.0,
      kano_category: 'Performance Feature',
      computed_rice: 11.16,
      computed_wsjf: 12.0,
      computed_ice: 63.79,
      moscow_tag: 'MUST',
    },
    {
      cluster_id: 'CLU-03',
      theme_title: 'Bi-Directional Linear & Jira Issue Sync with Gherkin Sub-Tasks',
      problem_summary:
        'Exported PRDs lack automatic Gherkin child sub-issue creation, idempotent re-export updates, and two-way webhook status synchronization when engineering closes tickets.',
      severity: 'P1',
      ticket_ids: ['TCK-116', 'TCK-117', 'TCK-118', 'TCK-119', 'TCK-120', 'TCK-121'],
      representative_quotes: [
        'Exporting a PRD to Linear creates the parent epic, but Gherkin `Given/When/Then` scenarios aren’t split into child sub-issues automatically.',
        'When engineers move a Linear issue to `Done`, CollabSense still shows the cluster status as `In Triage`—we need two-way webhook sync.',
        'Our staff engineers want the deterministic RICE breakdown table embedded directly inside the Linear issue Markdown description.',
      ],
      channels: ['Discord', 'Linear', 'Zendesk'],
      total_arr_impact: 335000,
      reach_count: 6,
      impact_score: 2.4,
      confidence_score: 0.9,
      effort_score: 2.0,
      wsjf_cod: 20,
      wsjf_duration: 2,
      ice_ease: 7.8,
      kano_category: 'Performance Feature',
      computed_rice: 6.48,
      computed_wsjf: 10.0,
      computed_ice: 56.16,
      moscow_tag: 'SHOULD',
    },
    {
      cluster_id: 'CLU-05',
      theme_title: 'Executive Read-Only Roadmap Portals & Immutable Score Audit Logs',
      problem_summary:
        'Enterprise VP & CS stakeholders require passwordless read-only roadmap links, customer ticket-to-cluster traceability portals, and SOC2-ready RICE override audit logs.',
      severity: 'P2',
      ticket_ids: ['TCK-127', 'TCK-128', 'TCK-129', 'TCK-130'],
      representative_quotes: [
        'VP of Product needs a passwordless Read-Only share link for the Now/Next/Later Roadmap so board members cannot drag RICE sliders.',
        "Need an immutable audit log showing which PM overrode Gemini's qualitative Impact estimate from 1.5 to 3.0 before QBR sign-off.",
      ],
      channels: ['Linear', 'Zendesk'],
      total_arr_impact: 427000,
      reach_count: 4,
      impact_score: 2.2,
      confidence_score: 0.88,
      effort_score: 1.8,
      wsjf_cod: 17,
      wsjf_duration: 2,
      ice_ease: 8.2,
      kano_category: 'Attractive / Delighter',
      computed_rice: 4.3,
      computed_wsjf: 8.5,
      computed_ice: 52.92,
      moscow_tag: 'COULD',
    },
    {
      cluster_id: 'CLU-04',
      theme_title: 'Mobile PWA IndexedDB Offline Cache & Touch Slider Lock',
      problem_summary:
        'iOS/Android users experience webview deep-link crashes, lost HITL Markdown edits during Wi-Fi drops, and accidental back-swipe gestures when dragging RICE sliders.',
      severity: 'P1',
      ticket_ids: ['TCK-122', 'TCK-123', 'TCK-124', 'TCK-125', 'TCK-126'],
      representative_quotes: [
        '1-Star iOS 18: Tapping a Slack push notification for a newly generated PRD crashes the mobile webview to a blank white screen.',
        'On commuter train Wi-Fi drops, unsaved edits in the HITL Markdown PRD editor vanish completely because IndexedDB local caching is missing.',
      ],
      channels: ['AppStore', 'Discord'],
      total_arr_impact: 92000,
      reach_count: 5,
      impact_score: 1.9,
      confidence_score: 0.85,
      effort_score: 2.5,
      wsjf_cod: 15,
      wsjf_duration: 3,
      ice_ease: 6.5,
      kano_category: 'Attractive / Delighter',
      computed_rice: 3.23,
      computed_wsjf: 5.0,
      computed_ice: 34.99,
      moscow_tag: 'COULD',
    },
  ],
  'RICE'
);

export function buildLocalPRD(cluster: FeedbackCluster, pmNotes = ''): GeneratedPRD {
  const slug = cluster.cluster_id.toLowerCase().replace('-', '_');
  const cleanNotes = pmNotes.trim().replace(/\.+$/, '');
  const notesClause = cleanNotes ? ` Incorporates PM directive: ${cleanNotes}.` : '';
  const title = `PRD: ${cluster.theme_title}`;
  const arrClause =
    cluster.total_arr_impact > 0
      ? ` representing $${cluster.total_arr_impact.toLocaleString()} in attributed ARR`
      : '';
  const executive_problem_statement = `${cluster.problem_summary} Directly evidenced across ${cluster.reach_count} customer tickets (${cluster.ticket_ids.slice(0, 6).join(', ')}) spanning ${cluster.channels.join(', ')}${arrClause}.${notesClause}`;
  const target_persona =
    'Enterprise Security Architects, Staff Product Managers, and Platform Engineering Leads operating multi-workspace B2B SaaS environments.';
  const strategic_narrative = `Classified as ${cluster.moscow_tag} (${cluster.kano_category}) with a deterministic RICE score of ${cluster.computed_rice} and WSJF of ${cluster.computed_wsjf}. Shipping this capability removes immediate enterprise expansion blockers and reduces manual support triage overhead by >78%.`;

  const user_stories = [
    {
      scenario_id: 'AC-01',
      title: 'Primary Happy-Path Execution & Sub-Second SLA',
      given: `an authenticated workspace tenant triggers the ${cluster.theme_title} workflow with valid payload parameters`,
      when: 'the request is processed by the FastAPI validation and persistence pipeline',
      then: 'the operation completes deterministically within < 450ms p95 latency, updates state in Supabase PostgreSQL under RLS, and emits a verified CollabSense telemetry event',
    },
    {
      scenario_id: 'AC-02',
      title: 'Idempotency, Concurrency & Retry Guardrail',
      given:
        'duplicate or concurrent requests arrive within a 5-second window carrying the same idempotency key',
      when: 'the backend deduplication middleware inspects the transaction fingerprint',
      then: 'the system upserts the existing record without creating duplicate artifacts and returns HTTP 200 OK',
    },
    {
      scenario_id: 'AC-03',
      title: 'Malformed Input & Security Boundary Enforcement',
      given:
        'an unauthenticated actor or malformed payload attempts to bypass tenant or schema constraints',
      when: 'Pydantic v2 schema validation and Supabase Row-Level Security (RLS) evaluate the request',
      then: 'execution halts immediately with a structured HTTP 422/403 diagnostic error and zero state mutation',
    },
  ];

  const defensive_edge_cases = [
    'Network partition or upstream provider 504 timeout mid-transaction: enforce exponential backoff (3 retries, jitter) and atomic rollback.',
    'CSV/Payload formula injection (`=`, `+`, `-`, `@` prefixes) or UTF-8 BOM byte sequences: strip unsafe prefixes before DB persistence.',
    'Concurrent multi-tab edits by two PMs on the same cluster: enforce optimistic concurrency control via `updated_at` version check.',
    'Zero-value or boundary denominator parameters during re-calibration: clamp `Effort >= 0.1` and `Duration >= 1` in pure Python/SQL.',
  ];

  const telemetry_events = [
    {
      event_name: `collabsense_${slug}_executed`,
      properties: ['cluster_id', 'tenant_tier', 'latency_ms', 'rice_score', 'ticket_count'],
      success_threshold: 'p95 latency < 450ms and >= 99.5% success rate over 7-day rolling window',
    },
    {
      event_name: `collabsense_${slug}_error_boundary`,
      properties: ['cluster_id', 'error_code', 'retry_attempt', 'source_channel'],
      success_threshold: '< 0.2% error rate across Enterprise and Mid-Market workspaces',
    },
  ];

  const rollout_plan = [
    'Phase 1 (Internal Dogfood & Pytest Gate): 100% unit test coverage + staging soak test across 30-row multi-channel dataset.',
    'Phase 2 (Design Partner Canary - 10% Enterprise Tenants): Enable via CollabSense feature flag with real-time error budget alerting.',
    'Phase 3 (General Availability): Roll out to 100% of workspaces with automated Linear sprint board synchronization.',
  ];

  const quotesMd = cluster.representative_quotes.map((q) => `> "${q}"`).join('\n');
  const storiesMd = user_stories
    .map(
      (s) =>
        `### ${s.scenario_id}: ${s.title}\n\`\`\`gherkin\nFeature: ${title}\n  Scenario: ${s.title}\n    Given ${s.given}\n    When ${s.when}\n    Then ${s.then}\n\`\`\``
    )
    .join('\n\n');

  const markdown_body = `# ${title}

| Metric / Attribute | Deterministic Value |
| :--- | :--- |
| **Cluster ID** | \`${cluster.cluster_id}\` |
| **Severity / MoSCoW / Kano** | \`${cluster.severity}\` / \`${cluster.moscow_tag}\` / \`${cluster.kano_category}\` |
| **Deterministic RICE Score** | **${cluster.computed_rice}** (\`Reach=${cluster.reach_count}, Impact=${cluster.impact_score}, Conf=${Math.round(cluster.confidence_score * 100)}%, Effort=${cluster.effort_score}\`) |
| **Deterministic WSJF / ICE** | **WSJF: ${cluster.computed_wsjf}** (\`CoD=${cluster.wsjf_cod}, Dur=${cluster.wsjf_duration}\`) / **ICE: ${cluster.computed_ice}** |
${
  cluster.total_arr_impact > 0
    ? `| **Attributed Tickets & ARR** | \`${cluster.ticket_ids.join(', ')}\` ($${cluster.total_arr_impact.toLocaleString()} ARR) |`
    : `| **Attributed Tickets** | \`${cluster.ticket_ids.join(', ')}\` |`
}

---

## 1. Executive Problem Statement
${executive_problem_statement}

### Verbatim Customer Evidence
${quotesMd}

---

## 2. Target Persona & Strategic Narrative
- **Target Persona**: ${target_persona}
- **Strategic Narrative**: ${strategic_narrative}

---

## 3. Gherkin Acceptance Criteria (\`Given / When / Then\`)
${storiesMd}

---

## 4. Defensive Edge Cases & Failure Modes
${defensive_edge_cases.map((e) => `- **[DEFENSIVE GUARD]** ${e}`).join('\n')}

---

## 5. CollabSense Telemetry & Success Metrics
${telemetry_events.map((ev) => `- \`${ev.event_name}\` — **Props**: \`${ev.properties.join(', ')}\` | **SLA**: ${ev.success_threshold}`).join('\n')}

---

## 6. Phased Rollout Plan
${rollout_plan.map((r, i) => `${i + 1}. ${r}`).join('\n')}
`;

  return {
    prd_id: `PRD-${cluster.cluster_id}`,
    cluster_id: cluster.cluster_id,
    title,
    executive_problem_statement,
    target_persona,
    strategic_narrative,
    deterministic_metrics_badge: {
      rice: cluster.computed_rice,
      wsjf: cluster.computed_wsjf,
      ice: cluster.computed_ice,
      moscow: cluster.moscow_tag,
      kano: cluster.kano_category,
      reach: cluster.reach_count,
      arr_impact: cluster.total_arr_impact,
    },
    user_stories,
    defensive_edge_cases,
    telemetry_events,
    rollout_plan,
    markdown_body,
    engine_used: 'gemini-2.5-flash (structured-prd-engine)',
  };
}
