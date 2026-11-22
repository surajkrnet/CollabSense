"""
Pure Deterministic Prioritization & Unit Economics Math Engine.
ENFORCES THE DETERMINISTIC MATH BOUNDARY (.agent/rules/architecture.md):
Zero LLM calls are permitted inside this module.
"""

from typing import List, Literal
from app.schemas import (
    FeedbackCluster,
    KanoCategory,
    MoscowTag,
    PrioritizeClusterInput,
    UnitEconomicsInput,
    UnitEconomicsOutput,
)

KANO_PRIORITY_ORDER = {
    "Must-Be": 4,
    "Performance Feature": 3,
    "Attractive / Delighter": 2,
    "Indifferent": 1,
}

MOSCOW_PRIORITY_ORDER = {
    "MUST": 4,
    "SHOULD": 3,
    "COULD": 2,
    "WONT": 1,
}


def calculate_rice(reach: int, impact: float, confidence: float, effort: float) -> float:
    """
    Deterministic RICE Formula:
    RICE = (Reach * Impact * Confidence) / Effort
    Guards against division by zero or negative effort by clamping effort >= 0.1.
    """
    safe_reach = max(int(reach), 0)
    safe_impact = max(float(impact), 0.0)
    safe_confidence = min(max(float(confidence), 0.0), 1.0)
    safe_effort = max(float(effort), 0.1)
    score = (safe_reach * safe_impact * safe_confidence) / safe_effort
    return round(score, 2)


def calculate_wsjf(cost_of_delay: int, job_duration: int) -> float:
    """
    Deterministic WSJF Formula:
    WSJF = Cost of Delay / Job Duration
    Guards against division by zero by clamping job_duration >= 1.
    """
    safe_cod = max(int(cost_of_delay), 0)
    safe_duration = max(int(job_duration), 1)
    return round(safe_cod / safe_duration, 2)


def calculate_ice(impact: float, confidence: float, ease: float) -> float:
    """
    Deterministic ICE Formula:
    Normalizes impact (0.5..3.0 -> 1.67..10.0) and confidence (0..1 -> 0..10),
    or if impact is already passed on 1..10 scale, computes:
    ICE = (Impact_10 * Confidence_10 * Ease) / 10
    """
    safe_impact_10 = float(impact) * (10.0 / 3.0) if float(impact) <= 3.0 else float(impact)
    safe_conf_10 = float(confidence) * 10.0 if float(confidence) <= 1.0 else float(confidence)
    safe_ease = min(max(float(ease), 1.0), 10.0)
    return round((safe_impact_10 * safe_conf_10 * safe_ease) / 10.0, 2)


def classify_moscow(rice_score: float, impact: float, confidence: float) -> MoscowTag:
    """Deterministic rule-based MoSCoW classification."""
    if rice_score >= 10.0 or (impact >= 2.5 and confidence >= 0.85 and rice_score >= 6.0):
        return "MUST"
    if rice_score >= 5.0:
        return "SHOULD"
    if rice_score >= 2.0:
        return "COULD"
    return "WONT"


def classify_kano(impact: float, severity: str, current_category: str = "") -> KanoCategory:
    """Deterministic Kano verification / fallback mapping."""
    valid_categories = {
        "Must-Be",
        "Performance Feature",
        "Attractive / Delighter",
        "Indifferent",
    }
    if current_category in valid_categories:
        return current_category  # type: ignore[return-value]
    if severity == "P0" or impact >= 2.6:
        return "Must-Be"
    if severity == "P1" or impact >= 1.8:
        return "Performance Feature"
    if impact >= 1.0:
        return "Attractive / Delighter"
    return "Indifferent"


def score_and_rank_clusters(
    clusters: List[PrioritizeClusterInput],
    framework: Literal["RICE", "WSJF", "ICE", "MOSCOW", "KANO"] = "RICE",
) -> List[FeedbackCluster]:
    """
    Hydrates every cluster with deterministic RICE, WSJF, ICE, MoSCoW, and Kano scores
    and sorts them deterministically by the selected prioritization framework.
    """
    scored: List[FeedbackCluster] = []
    for item in clusters:
        safe_effort = max(float(item.effort_score), 0.5)
        safe_duration = max(int(item.wsjf_duration), 1)
        rice = calculate_rice(
            reach=item.reach_count,
            impact=item.impact_score,
            confidence=item.confidence_score,
            effort=item.effort_score,
        )
        wsjf = calculate_wsjf(
            cost_of_delay=item.wsjf_cod,
            job_duration=item.wsjf_duration,
        )
        ice = calculate_ice(
            impact=item.impact_score,
            confidence=item.confidence_score,
            ease=item.ice_ease,
        )
        moscow = classify_moscow(
            rice_score=rice,
            impact=item.impact_score,
            confidence=item.confidence_score,
        )
        kano = classify_kano(
            impact=item.impact_score,
            severity=item.severity,
            current_category=item.kano_category,
        )

        scored.append(
            FeedbackCluster(
                cluster_id=item.cluster_id,
                theme_title=item.theme_title,
                problem_summary=item.problem_summary,
                severity=item.severity,
                ticket_ids=item.ticket_ids,
                representative_quotes=item.representative_quotes,
                channels=item.channels,
                total_arr_impact=round(item.total_arr_impact, 2),
                reach_count=item.reach_count,
                impact_score=round(item.impact_score, 2),
                confidence_score=round(item.confidence_score, 2),
                effort_score=round(safe_effort, 2),
                wsjf_cod=item.wsjf_cod,
                wsjf_duration=safe_duration,
                ice_ease=round(item.ice_ease, 2),
                kano_category=kano,
                computed_rice=rice,
                computed_wsjf=wsjf,
                computed_ice=ice,
                moscow_tag=moscow,
                intent_category=item.intent_category or "Bug / Defect",
                product_area=item.product_area or "Core Product",
                root_cause=item.root_cause or "",
                workaround_available=item.workaround_available or "Unknown",
                gate1_status=item.gate1_status or "PENDING",
                gate1_notes=item.gate1_notes or "",
                verified_citations=item.verified_citations or item.ticket_ids,
                sub_category=item.sub_category or "",
                affected_persona=item.affected_persona or "",
                user_journey_stage=item.user_journey_stage or "",
                churn_risk=item.churn_risk or ("Critical" if item.severity == "P0" else "High" if item.severity == "P1" else "Medium"),
                sentiment=item.sentiment or ("Urgent / Blocking" if item.severity == "P0" else "Frustrated"),
                tags=item.tags or [],
                suggested_owner=item.suggested_owner or "",
            )
        )

    if framework == "WSJF":
        scored.sort(key=lambda c: (c.computed_wsjf, c.computed_rice), reverse=True)
    elif framework == "ICE":
        scored.sort(key=lambda c: (c.computed_ice, c.computed_rice), reverse=True)
    elif framework == "MOSCOW":
        scored.sort(
            key=lambda c: (MOSCOW_PRIORITY_ORDER.get(c.moscow_tag, 0), c.computed_rice),
            reverse=True,
        )
    elif framework == "KANO":
        scored.sort(
            key=lambda c: (KANO_PRIORITY_ORDER.get(c.kano_category, 0), c.computed_rice),
            reverse=True,
        )
    else:
        # Default: RICE
        scored.sort(key=lambda c: (c.computed_rice, c.computed_wsjf), reverse=True)

    return scored


def calculate_unit_economics(payload: UnitEconomicsInput) -> UnitEconomicsOutput:
    """
    Deterministic SaaS + AI Unit Economics Engine.
    Models monthly LLM token burn (triage clustering + PRD synthesis), COGS,
    Blended Gross Margin %, LTV, LTV:CAC, and CAC Payback Months.
    """
    # Average 420 tokens per ticket (input + structured JSON output) + 4,500 tokens per PRD
    monthly_triage_tokens = payload.tickets_per_tenant_month * 420
    monthly_prd_tokens = payload.prds_per_tenant_month * 4500
    total_tokens_millions = (monthly_triage_tokens + monthly_prd_tokens) / 1_000_000.0

    llm_burn = round(total_tokens_millions * payload.gemini_cost_per_1m_tokens, 2)
    total_cogs = round(payload.base_cloud_cogs_per_tenant + llm_burn, 2)
    gross_profit = round(payload.arpu_monthly - total_cogs, 2)
    margin_pct = round((gross_profit / max(payload.arpu_monthly, 0.01)) * 100.0, 2)

    churn_decimal = max(payload.monthly_churn_pct / 100.0, 0.001)
    ltv = round(max(gross_profit, 0.0) / churn_decimal, 2)
    ltv_cac = round(ltv / max(payload.cac, 1.0), 2)
    payback_months = round(payload.cac / max(gross_profit, 0.01), 2)

    if margin_pct >= 80.0 and ltv_cac >= 3.0:
        verdict = "ELITE_SAAS"
    elif margin_pct >= 65.0 and ltv_cac >= 2.0:
        verdict = "HEALTHY"
    else:
        verdict = "MARGIN_ALERT"

    return UnitEconomicsOutput(
        arpu_monthly=round(payload.arpu_monthly, 2),
        llm_inference_burn_monthly=llm_burn,
        total_cogs_monthly=total_cogs,
        blended_gross_margin_pct=margin_pct,
        gross_profit_monthly=gross_profit,
        ltv=ltv,
        ltv_cac_ratio=ltv_cac,
        cac_payback_months=payback_months,
        health_verdict=verdict,
    )
