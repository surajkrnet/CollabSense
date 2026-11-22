from typing import Dict, List
from fastapi import APIRouter
from app.config import settings
from app.data.sample_tickets import SAMPLE_30_TICKETS
from app.schemas import (
    ClusterRequest,
    ClusterResponse,
    GeneratePRDRequest,
    GeneratedPRD,
    HomeCopilotRequest,
    HomeCopilotResponse,
    LoopClosureDraftItem,
    PRDChatRequest,
    PRDChatResponse,
    PrioritizeRequest,
    PrioritizeResponse,
    RawTicket,
    ReleaseValidationItem,
    Stage2NoiseRequest,
    Stage2NoiseResponse,
    Stage4TriageRequest,
    Stage4TriageResponse,
    Stage7ValidateRequest,
    Stage8GenerateRequest,
    UnitEconomicsInput,
    UnitEconomicsOutput,
)
from app.services.clustering_service import (
    cluster_and_score_tickets_async,
)
from app.services.linear_service import (
    LinearExportRequest,
    LinearExportResponse,
    export_prd_to_linear,
)
from app.services.prd_service import chat_refine_prd, synthesize_prd
from app.services.scorer_service import calculate_unit_economics, score_and_rank_clusters
from app.services.supabase_service import is_supabase_configured
from app.services.openrouter_service import (
    is_nvidia_configured,
    is_openrouter_configured,
)
from app.services.workflow_service import (
    get_default_loop_closures,
    get_default_release_validations,
    run_home_copilot,
    run_stage2_noise_and_enrichment,
    run_stage4_root_cause_triage,
    run_stage7_validate_release,
    run_stage8_generate_loop_closures,
)

router = APIRouter()

FORMULA_MAP: Dict[str, str] = {
    "RICE": "RICE = (Reach * Impact * Confidence) / max(Effort, 0.1)",
    "WSJF": "WSJF = Cost_of_Delay / max(Job_Duration, 1)",
    "ICE": "ICE = (Impact_10 * Confidence_10 * Ease) / 10",
    "MOSCOW": "MoSCoW = Deterministic threshold rule on RICE & Impact/Confidence",
    "KANO": "Kano = Must-Be > Performance Feature > Attractive / Delighter > Indifferent",
}


@router.get("/api/v1/env-status", tags=["System"])
def get_env_status() -> dict:
    """Explicitly reports configured vs missing environment variables, models, and fallback timeouts."""
    has_ai = is_openrouter_configured()
    has_nvidia = is_nvidia_configured()
    has_supabase = is_supabase_configured()
    missing: List[str] = []
    if not has_supabase:
        missing.append("SUPABASE_URL / SUPABASE_ANON_KEY")
    if not has_ai:
        missing.append("NVIDIA_API_KEY / OPENROUTER_API_KEY")

    return {
        "supabase_configured": has_supabase,
        "supabase_url": settings.supabase_url or None,
        "openrouter_configured": has_ai,
        "nvidia_nim_configured": has_nvidia,
        "light_model": settings.nvidia_light_model if has_nvidia else settings.openrouter_light_model,
        "decider_model": settings.openrouter_decider_model,
        "strong_model": settings.openrouter_strong_model,
        "strong_provider": "nvidia-nim",
        "kimi_primary_timeout_seconds": settings.kimi_primary_timeout_seconds,
        "openrouter_ultra_model": settings.openrouter_ultra_model,
        "openrouter_super_model": settings.openrouter_super_model,
        "openrouter_light_model": settings.openrouter_light_model,
        "openrouter_allowed_models": [
            settings.openrouter_decider_model,
            settings.openrouter_ultra_model,
            settings.openrouter_super_model,
            settings.openrouter_light_model,
            settings.openrouter_gemma_large_model,
            settings.openrouter_gemma_fast_model,
            settings.openrouter_ling_flash_model,
        ],
        "missing_env_vars": missing,
    }


@router.get("/api/v1/sample-tickets", response_model=List[RawTicket], tags=["Stage 1: Upload Data"])
def get_sample_tickets() -> List[RawTicket]:
    """Returns the 30-row realistic multi-channel B2B SaaS feedback dataset."""
    return SAMPLE_30_TICKETS


@router.post("/api/v1/stages/noise", response_model=Stage2NoiseResponse, tags=["Stage 2: Noise & Enrichment"])
async def stage2_noise_endpoint(payload: Stage2NoiseRequest) -> Stage2NoiseResponse:
    """Stage 2: Fast chunked AI noise filtering & account tier/ARR context enrichment across 100% of rows."""
    return await run_stage2_noise_and_enrichment(payload)


@router.post("/api/v1/stages/triage", response_model=Stage4TriageResponse, tags=["Stage 3 & 4: Intent & Root Cause"])
async def stage4_triage_endpoint(payload: Stage4TriageRequest) -> Stage4TriageResponse:
    """Stage 3 & 4: Unrestricted signal taxonomy, semantic clustering, root cause analysis, & verified citations."""
    return await run_stage4_root_cause_triage(payload)


@router.post("/api/v1/cluster", response_model=ClusterResponse, tags=["Triage & Clustering"])
@router.post("/api/triage/cluster", response_model=ClusterResponse, tags=["Triage & Clustering"])
async def cluster_tickets_endpoint(payload: ClusterRequest) -> ClusterResponse:
    """Groups multi-channel customer tickets into root problem themes and computes deterministic scores."""
    return await cluster_and_score_tickets_async(batch_name=payload.batch_name, tickets=payload.tickets)


@router.post("/api/v1/prioritize", response_model=PrioritizeResponse, tags=["Stage 5: Prioritization Math"])
@router.post("/api/triage/score", response_model=PrioritizeResponse, tags=["Stage 5: Prioritization Math"])
def prioritize_clusters_endpoint(payload: PrioritizeRequest) -> PrioritizeResponse:
    """
    Pure-Python deterministic prioritization recalculation endpoint (< 5ms).
    Supports RICE, WSJF, ICE, MoSCoW, and Kano frameworks with zero LLM involvement.
    """
    ranked = score_and_rank_clusters(clusters=payload.clusters, framework=payload.framework)
    return PrioritizeResponse(
        framework=payload.framework,
        formula_applied=FORMULA_MAP.get(payload.framework, FORMULA_MAP["RICE"]),
        clusters=ranked,
    )


@router.post("/api/v1/generate-prd", response_model=GeneratedPRD, tags=["Stage 6: HITL PRD Studio"])
@router.post("/api/prd/generate", response_model=GeneratedPRD, tags=["Stage 6: HITL PRD Studio"])
async def generate_prd_endpoint(payload: GeneratePRDRequest) -> GeneratedPRD:
    """Synthesizes an engineering-ready PRD with Gherkin Given/When/Then scenarios and edge cases."""
    return await synthesize_prd(cluster=payload.cluster, pm_notes=payload.pm_notes or "")


@router.post("/api/v1/prd/chat", response_model=PRDChatResponse, tags=["Stage 6: HITL PRD Studio"])
async def chat_refine_prd_endpoint(payload: PRDChatRequest) -> PRDChatResponse:
    """Stage 6 Interactive PRD Assistant: drafts or refines the live PRD and reports changed sections."""
    return await chat_refine_prd(payload)


@router.get("/api/v1/stages/release-validation", response_model=List[ReleaseValidationItem], tags=["Stage 7: Release Validation"])
def stage7_release_validation_endpoint() -> List[ReleaseValidationItem]:
    """Stage 7: Post-release complaint spike & telemetry verification."""
    return get_default_release_validations()


@router.post("/api/v1/stages/validate-release", response_model=ReleaseValidationItem, tags=["Stage 7: Release Validation"])
async def stage7_validate_release_ai_endpoint(payload: Stage7ValidateRequest) -> ReleaseValidationItem:
    """Stage 7: Deterministic spike detection + AI telemetry verification summary."""
    return await run_stage7_validate_release(payload)


@router.get("/api/v1/stages/loop-closure", response_model=List[LoopClosureDraftItem], tags=["Stage 8: Loop Closure"])
def stage8_loop_closure_endpoint() -> List[LoopClosureDraftItem]:
    """Stage 8: Customer update drafts & resolution tracking across Zendesk, Discord, and Email."""
    return get_default_loop_closures()


@router.post("/api/v1/stages/loop-closure/generate", response_model=List[LoopClosureDraftItem], tags=["Stage 8: Loop Closure"])
async def stage8_generate_loop_closure_ai_endpoint(payload: Stage8GenerateRequest) -> List[LoopClosureDraftItem]:
    """Stage 8: AI-drafted customer notifications & internal Support/Sales release notes."""
    return await run_stage8_generate_loop_closures(payload)


@router.post("/api/v1/copilot/chat", response_model=HomeCopilotResponse, tags=["Home AI Co-Pilot"])
async def home_copilot_endpoint(payload: HomeCopilotRequest) -> HomeCopilotResponse:
    """Project-scoped Home AI command chatbot with verified ticket citations and <=8s Kimi fallback."""
    return await run_home_copilot(payload)


@router.post("/api/v1/unit-economics", response_model=UnitEconomicsOutput, tags=["Strategy & Economics"])
def calculate_unit_economics_endpoint(payload: UnitEconomicsInput) -> UnitEconomicsOutput:
    """Pure-Python SaaS + LLM inference unit economics calculator."""
    return calculate_unit_economics(payload)


@router.post("/api/v1/export-linear", response_model=LinearExportResponse, tags=["Stage 6: HITL PRD Studio"])
def export_linear_endpoint(payload: LinearExportRequest) -> LinearExportResponse:
    """Exports an approved PRD to Linear via GraphQL mutation."""
    return export_prd_to_linear(payload)
