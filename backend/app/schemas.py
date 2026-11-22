import re
from typing import Dict, List, Literal, Optional
from pydantic import BaseModel, Field, field_validator

# =============================================================================
# CSV / Formula-Injection Sanitization Utility
# =============================================================================
FORMULA_PREFIX_REGEX = re.compile(r"^[\=\+\-\@\t\r]+")


def sanitize_formula_injection(value: str) -> str:
    """Strips leading spreadsheet formula injection characters (=, +, -, @, tab, CR)."""
    if not isinstance(value, str):
        return str(value)
    cleaned = value.strip()
    cleaned = FORMULA_PREFIX_REGEX.sub("", cleaned).strip()
    return cleaned


# =============================================================================
# 1. Ingestion & Ticket Schemas
# =============================================================================
TicketSource = str
CustomerTier = Literal["Enterprise", "Mid-Market", "Pro", "Standard", "Free"]
SeverityLevel = Literal["P0", "P1", "P2", "P3", "P4"]
MoscowTag = Literal["MUST", "SHOULD", "COULD", "WONT"]
KanoCategory = Literal[
    "Must-Be",
    "Performance Feature",
    "Attractive / Delighter",
    "Indifferent",
]
# Dynamic open taxonomy across all PM signal domains (never restricted to 5 labels)
IntentCategory = str
ChurnRiskLevel = Literal["Critical", "High", "Medium", "Low"]
SentimentLevel = Literal["Urgent / Blocking", "Frustrated", "Neutral", "Constructive"]


class RawTicket(BaseModel):
    """Represents a single multi-channel customer feedback item."""

    id: str = Field(..., description="Unique ticket code, e.g., TCK-101")
    source: TicketSource = Field(default="CSV", description="Feedback channel origin")
    customer_tier: CustomerTier = Field(default="Standard", description="Account tier")
    arr_weight: float = Field(default=0.0, ge=0.0, description="Account ARR in USD (0 if not supplied)")
    content: str = Field(..., min_length=1, description="Sanitized ticket feedback text")
    created_at: Optional[str] = Field(default="2026-11-12T10:00:00Z")

    @field_validator("source", mode="before")
    @classmethod
    def normalize_source(cls, v: Optional[str]) -> str:
        clean = str(v or "").strip()
        return clean or "CSV"

    @field_validator("content", "id", mode="before")
    @classmethod
    def sanitize_text_fields(cls, v: str) -> str:
        if isinstance(v, str):
            sanitized = sanitize_formula_injection(v)
            if not sanitized:
                raise ValueError("Field cannot be empty after formula-injection sanitization.")
            return sanitized
        return v


class ClusterRequest(BaseModel):
    """Input payload for POST /api/v1/cluster."""

    batch_name: str = Field(default="Q4 Multi-Channel Triage Batch")
    tickets: List[RawTicket] = Field(..., min_length=1, max_length=2000)


# =============================================================================
# 2. LLM Qualitative Response Schema (STRICTLY NO MATH SCORES ALLOWED)
# =============================================================================
class LLMQualitativeCluster(BaseModel):
    """
    Schema passed directly to LLM structured response_schema.
    NOTE: Contains ONLY qualitative assessments & bounds. Zero calculated scores!
    """

    cluster_id: str = Field(..., description="Deterministic slug ID, e.g., CLU-01")
    theme_title: str = Field(..., description="Concise engineering-ready problem theme title")
    problem_summary: str = Field(..., description="2-3 sentence root cause synthesis")
    severity: SeverityLevel = Field(..., description="Qualitative severity P0, P1, P2, P3, or P4")
    ticket_ids: List[str] = Field(..., min_length=1, description="Exact IDs of grouped tickets")
    representative_quotes: List[str] = Field(
        ..., min_length=1, max_length=4, description="Verbatim quotes from raw tickets"
    )
    impact_score: float = Field(
        ..., ge=0.5, le=3.0, description="Qualitative impact bound in [0.5, 3.0]"
    )
    effort_score: float = Field(
        ..., ge=1.0, le=5.0, description="Qualitative effort bound in person-months [1.0, 5.0]"
    )
    confidence_score: float = Field(
        ..., ge=0.0, le=1.0, description="Qualitative confidence bound in [0.0, 1.0]"
    )
    wsjf_cod: int = Field(
        default=18, ge=1, le=30, description="Qualitative Cost of Delay (User Value + Time Criticality + Risk)"
    )
    wsjf_duration: int = Field(
        default=2, ge=1, le=10, description="Qualitative Job Duration in sprints [1, 10]"
    )
    ice_ease: float = Field(
        default=7.0, ge=1.0, le=10.0, description="Qualitative implementation ease [1.0, 10.0]"
    )
    kano_category: KanoCategory = Field(
        default="Performance Feature", description="Kano model classification"
    )
    intent_category: IntentCategory = Field(
        default="Bug / Defect", description="Dynamic signal classification category"
    )
    product_area: str = Field(
        default="Core Product", description="Mapped product area or epic"
    )
    root_cause: str = Field(
        default="", description="Underlying workflow root cause synthesis"
    )
    workaround_available: str = Field(
        default="Unknown", description="Whether an interim workaround exists"
    )
    verified_citations: List[str] = Field(
        default_factory=list, description="Ticket IDs directly evidencing this root cause"
    )
    sub_category: str = Field(default="", description="Specific fine-grained signal sub-category")
    affected_persona: str = Field(default="", description="Primary affected user role/persona")
    user_journey_stage: str = Field(default="", description="Lifecycle stage e.g. Onboarding, Core Workflow, Billing")
    churn_risk: ChurnRiskLevel = Field(default="Medium", description="Customer retention risk level")
    sentiment: SentimentLevel = Field(default="Frustrated", description="Dominant emotional tone")
    tags: List[str] = Field(default_factory=list, description="2-5 concise signal taxonomy keywords")
    suggested_owner: str = Field(default="", description="Recommended owning team e.g. Platform, Identity, Frontend")


class LLMClusteringEnvelope(BaseModel):
    """Top-level structured output returned by LLM clustering."""

    clusters: List[LLMQualitativeCluster]


# =============================================================================
# 3. Deterministic Prioritized Cluster Schema (Output of scorer_service.py)
# =============================================================================
class FeedbackCluster(BaseModel):
    """Full problem cluster hydrated with pure-Python deterministic prioritization math."""

    cluster_id: str
    theme_title: str
    problem_summary: str
    severity: SeverityLevel
    ticket_ids: List[str]
    representative_quotes: List[str]
    channels: List[str] = Field(default_factory=list)
    total_arr_impact: float = Field(default=0.0, ge=0.0)

    # 8-Stage Workflow Metadata (Optional with defaults for backwards compatibility)
    intent_category: IntentCategory = Field(default="Bug / Defect")
    product_area: str = Field(default="Core Product")
    root_cause: str = Field(default="")
    workaround_available: str = Field(default="Unknown")
    gate1_status: Literal["PENDING", "APPROVED", "REJECTED"] = Field(default="PENDING")
    gate1_notes: Optional[str] = Field(default=None)
    verified_citations: List[str] = Field(default_factory=list)
    sub_category: str = Field(default="")
    affected_persona: str = Field(default="")
    user_journey_stage: str = Field(default="")
    churn_risk: ChurnRiskLevel = Field(default="Medium")
    sentiment: SentimentLevel = Field(default="Frustrated")
    tags: List[str] = Field(default_factory=list)
    suggested_owner: str = Field(default="")

    # Qualitative inputs (adjustable via 60fps UI sliders)
    reach_count: int = Field(..., ge=1)
    impact_score: float = Field(..., ge=0.5, le=3.0)
    confidence_score: float = Field(..., ge=0.0, le=1.0)
    effort_score: float = Field(..., ge=0.5, le=10.0)
    wsjf_cod: int = Field(default=15, ge=1, le=50)
    wsjf_duration: int = Field(default=2, ge=1, le=20)
    ice_ease: int | float = Field(default=6.0, ge=1.0, le=10.0)
    kano_category: KanoCategory = Field(default="Performance Feature")

    # Deterministic outputs (Computed exclusively by scorer_service.py)
    computed_rice: float = Field(..., description="Deterministic (Reach * Impact * Confidence) / Effort")
    computed_wsjf: float = Field(..., description="Deterministic Cost_of_Delay / Job_Duration")
    computed_ice: float = Field(..., description="Deterministic (Impact_10 * Confidence_10 * Ease) / 10")
    moscow_tag: MoscowTag = Field(..., description="Deterministic threshold tag MUST/SHOULD/COULD/WONT")


class ClusterResponse(BaseModel):
    """Response payload for POST /api/v1/cluster."""

    batch_name: str
    total_tickets: int
    engine_used: str
    latency_ms: float
    clusters: List[FeedbackCluster]


class PrioritizeClusterInput(BaseModel):
    """Single cluster input for deterministic re-scoring."""

    cluster_id: str
    theme_title: str = "Cluster Theme"
    problem_summary: str = "Problem Summary"
    severity: SeverityLevel = "P1"
    ticket_ids: List[str] = Field(default_factory=lambda: ["TCK-101"])
    representative_quotes: List[str] = Field(default_factory=lambda: ["Sample verbatim quote"])
    channels: List[str] = Field(default_factory=lambda: ["Zendesk"])
    total_arr_impact: float = 0.0
    reach_count: int = Field(..., ge=1)
    impact_score: float = Field(..., ge=0.5, le=3.0)
    confidence_score: float = Field(..., ge=0.0, le=1.0)
    effort_score: float = Field(..., ge=0.0, le=10.0)
    wsjf_cod: int = Field(default=15, ge=1, le=50)
    wsjf_duration: int = Field(default=2, ge=0, le=20)
    ice_ease: float = Field(default=6.0, ge=1.0, le=10.0)
    kano_category: KanoCategory = Field(default="Performance Feature")
    intent_category: Optional[IntentCategory] = None
    product_area: Optional[str] = None
    root_cause: Optional[str] = None
    workaround_available: Optional[str] = None
    gate1_status: Optional[Literal["PENDING", "APPROVED", "REJECTED"]] = None
    gate1_notes: Optional[str] = None
    verified_citations: Optional[List[str]] = None
    sub_category: Optional[str] = None
    affected_persona: Optional[str] = None
    user_journey_stage: Optional[str] = None
    churn_risk: Optional[ChurnRiskLevel] = None
    sentiment: Optional[SentimentLevel] = None
    tags: Optional[List[str]] = None
    suggested_owner: Optional[str] = None


class PrioritizeRequest(BaseModel):
    """Input payload for POST /api/v1/prioritize."""

    framework: Literal["RICE", "WSJF", "ICE", "MOSCOW", "KANO"] = "RICE"
    clusters: List[PrioritizeClusterInput]


class PrioritizeResponse(BaseModel):
    """Output payload for POST /api/v1/prioritize."""

    framework: str
    formula_applied: str
    clusters: List[FeedbackCluster]


# =============================================================================
# 4. HITL PRD & Gherkin Studio Schemas
# =============================================================================
class GherkinScenario(BaseModel):
    """Single Gherkin acceptance criterion."""

    scenario_id: str = Field(..., description="e.g., AC-01")
    title: str
    given: str
    when: str
    then: str


class TelemetryEventSpec(BaseModel):
    """CollabSense telemetry instrumentation event."""

    event_name: str = Field(..., description="snake_case telemetry event")
    properties: List[str]
    success_threshold: str


class LLMPRDSynthesisSchema(BaseModel):
    """Structured schema passed to LLM for PRD synthesis."""

    title: str
    executive_problem_statement: str
    target_persona: str
    strategic_narrative: str
    user_stories: List[GherkinScenario] = Field(..., min_length=2)
    defensive_edge_cases: List[str] = Field(..., min_length=2)
    telemetry_events: List[TelemetryEventSpec] = Field(..., min_length=2)
    rollout_plan: List[str] = Field(..., min_length=2)


class GeneratePRDRequest(BaseModel):
    """Input payload for POST /api/v1/generate-prd."""

    cluster: FeedbackCluster
    pm_notes: Optional[str] = Field(default="")


class GeneratedPRD(BaseModel):
    """Full response payload for POST /api/v1/generate-prd."""

    prd_id: str
    cluster_id: str
    title: str
    executive_problem_statement: str
    target_persona: str
    strategic_narrative: str
    deterministic_metrics_badge: dict
    user_stories: List[GherkinScenario]
    defensive_edge_cases: List[str]
    telemetry_events: List[TelemetryEventSpec]
    rollout_plan: List[str]
    markdown_body: str
    engine_used: str


class PRDChatTurn(BaseModel):
    """Single conversational turn in Stage 6 Interactive PRD Assistant."""

    role: Literal["user", "assistant"]
    content: str


class PRDChatRequest(BaseModel):
    """Input payload for POST /api/v1/prd/chat."""

    cluster: FeedbackCluster
    current_prd: Optional[GeneratedPRD] = None
    instruction: str = Field(..., min_length=1)
    history: List[PRDChatTurn] = Field(default_factory=list)
    project_name: str = Field(default="")
    okr_focus: str = Field(default="")


class PRDChatResponse(BaseModel):
    """Output payload for POST /api/v1/prd/chat returning live-updated PRD & changed section markers."""

    assistant_reply: str
    changed_sections: List[str]
    updated_prd: GeneratedPRD
    model_used: str
    latency_ms: float = 0.0


# =============================================================================
# 5. SaaS + AI Unit Economics Simulator Schemas
# =============================================================================
class UnitEconomicsInput(BaseModel):
    """Inputs for deterministic SaaS + LLM inference financial modeling."""

    arpu_monthly: float = Field(default=149.0, ge=1.0, le=10000.0)
    cac: float = Field(default=420.0, ge=1.0, le=50000.0)
    monthly_churn_pct: float = Field(default=2.8, ge=0.1, le=50.0)
    tickets_per_tenant_month: int = Field(default=2500, ge=10, le=500000)
    prds_per_tenant_month: int = Field(default=25, ge=1, le=5000)
    gemini_cost_per_1m_tokens: float = Field(default=0.15, ge=0.01, le=20.0)
    base_cloud_cogs_per_tenant: float = Field(default=6.50, ge=0.0, le=1000.0)


class UnitEconomicsOutput(BaseModel):
    """Deterministic unit economics output."""

    arpu_monthly: float
    llm_inference_burn_monthly: float
    total_cogs_monthly: float
    blended_gross_margin_pct: float
    gross_profit_monthly: float
    ltv: float
    ltv_cac_ratio: float
    cac_payback_months: float
    health_verdict: Literal["ELITE_SAAS", "HEALTHY", "MARGIN_ALERT"]


# =============================================================================
# 6. CollabSense v4 8-Stage Workflow Schemas (Stages 2–8 + Home Co-Pilot)
# =============================================================================
class EnrichedTicket(RawTicket):
    """Stage 2/3 ticket enriched with noise filter status, intent category, and citation badge."""

    is_noise: bool = False
    noise_category: Optional[str] = None
    noise_reason: Optional[str] = None
    intent: IntentCategory = "Bug / Defect"
    urgency: ChurnRiskLevel = "Medium"
    account_context: str = "Standard Tier"


class Stage2NoiseRequest(BaseModel):
    project_id: str = "proj-default"
    tickets: List[RawTicket]


class Stage2NoiseResponse(BaseModel):
    project_id: str
    model_used: str
    openrouter_configured: bool
    env_notice: Optional[str] = None
    total_count: int
    signal_count: int
    noise_count: int
    noise_breakdown: Dict[str, int] = Field(default_factory=dict)
    latency_ms: float = 0.0
    tickets: List[EnrichedTicket]


class Stage4TriageRequest(BaseModel):
    project_id: str = "proj-default"
    tickets: List[RawTicket]


class Stage4TriageResponse(BaseModel):
    project_id: str
    model_used: str
    openrouter_configured: bool
    env_notice: Optional[str] = None
    clusters: List[FeedbackCluster]


class ReleaseValidationItem(BaseModel):
    cluster_id: str
    theme_title: str
    release_tag: str
    pre_release_daily_tickets: float
    post_release_daily_tickets: float
    delta_pct: float
    spike_detected: bool
    verdict: Literal["VERIFIED_RESOLVED", "MONITORING", "REGRESSION_SPIKE"]
    regression_summary: str
    citations: List[str]


class LoopClosureDraftItem(BaseModel):
    draft_id: str
    cluster_id: str
    theme_title: str
    channel: Literal["Zendesk", "Discord", "Email", "Linear"]
    recipient_segment: str
    cited_tickets: List[str]
    subject: str
    message_body: str
    internal_playbook_note: str = Field(default="")
    status: Literal["DRAFT", "APPROVED_TO_SEND", "SENT"] = "DRAFT"


class Stage7ValidateRequest(BaseModel):
    project_id: str = "proj-default"
    cluster_id: str
    theme_title: str
    release_tag: str = "v1.0.0"
    feature_flag: str = ""
    pre_release_daily_tickets: float = Field(..., ge=0.0)
    post_release_daily_tickets: float = Field(..., ge=0.0)
    citations: List[str] = Field(default_factory=list)
    post_release_notes: str = ""


class Stage8GenerateRequest(BaseModel):
    project_id: str = "proj-default"
    project_name: str = "Core Product OS"
    clusters: List[FeedbackCluster] = Field(default_factory=list)


class HomeCopilotRequest(BaseModel):
    project_id: str = "proj-default"
    project_name: str = "Core Product OS"
    okr_focus: str = "Reduce Enterprise SAML churn & speed up PRD triage"
    prompt: str
    tickets: List[RawTicket] = Field(default_factory=list)
    clusters: List[FeedbackCluster] = Field(default_factory=list)


class HomeCopilotResponse(BaseModel):
    reply: str
    citations: List[str]
    suggested_stage: Optional[str] = None
    model_used: str
    openrouter_configured: bool
    env_notice: Optional[str] = None
    latency_ms: float = 0.0
