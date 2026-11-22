"""
Unit tests verifying zero arithmetic drift and division-by-zero guards across
RICE, WSJF, ICE, MoSCoW, Kano, and SaaS + AI Unit Economics calculators.
"""

import pytest
from app.schemas import PrioritizeClusterInput, UnitEconomicsInput
from app.services.scorer_service import (
    calculate_ice,
    calculate_rice,
    calculate_unit_economics,
    calculate_wsjf,
    classify_kano,
    classify_moscow,
    score_and_rank_clusters,
)


def test_calculate_rice_exact_math() -> None:
    # (Reach=8 * Impact=2.5 * Confidence=0.9) / Effort=2.0 = 18.0 / 2.0 = 9.0
    assert calculate_rice(reach=8, impact=2.5, confidence=0.90, effort=2.0) == 9.0
    # (Reach=12 * Impact=3.0 * Confidence=0.8) / Effort=1.5 = 28.8 / 1.5 = 19.2
    assert calculate_rice(reach=12, impact=3.0, confidence=0.80, effort=1.5) == 19.2


def test_calculate_rice_division_by_zero_guard() -> None:
    # Effort=0.0 must clamp to 0.1 and never raise ZeroDivisionError
    score = calculate_rice(reach=5, impact=2.0, confidence=0.80, effort=0.0)
    assert score == 80.0
    # Negative effort also clamped to 0.1
    score_neg = calculate_rice(reach=5, impact=2.0, confidence=0.80, effort=-3.0)
    assert score_neg == 80.0


def test_calculate_wsjf_exact_and_zero_duration_guard() -> None:
    assert calculate_wsjf(cost_of_delay=28, job_duration=2) == 14.0
    assert calculate_wsjf(cost_of_delay=19, job_duration=3) == 6.33
    # Duration=0 clamps to 1
    assert calculate_wsjf(cost_of_delay=25, job_duration=0) == 25.0


def test_calculate_ice_exact() -> None:
    # impact=3.0 -> 10.0 on 10-scale; confidence=0.9 -> 9.0; ease=8.0 -> (10 * 9 * 8) / 10 = 72.0
    assert calculate_ice(impact=3.0, confidence=0.90, ease=8.0) == 72.0
    # impact=1.5 -> 5.0; confidence=0.8 -> 8.0; ease=5.0 -> (5 * 8 * 5) / 10 = 20.0
    assert calculate_ice(impact=1.5, confidence=0.80, ease=5.0) == 20.0


def test_classify_moscow_and_kano() -> None:
    assert classify_moscow(rice_score=12.5, impact=2.5, confidence=0.9) == "MUST"
    assert classify_moscow(rice_score=7.2, impact=2.0, confidence=0.8) == "SHOULD"
    assert classify_moscow(rice_score=3.1, impact=1.2, confidence=0.7) == "COULD"
    assert classify_moscow(rice_score=1.2, impact=0.8, confidence=0.5) == "WONT"

    assert classify_kano(impact=2.8, severity="P0") == "Must-Be"
    assert classify_kano(impact=2.0, severity="P1") == "Performance Feature"
    assert classify_kano(impact=1.2, severity="P2") == "Attractive / Delighter"


def test_score_and_rank_clusters_across_frameworks() -> None:
    c1 = PrioritizeClusterInput(
        cluster_id="CLU-A",
        theme_title="High RICE Cluster",
        reach_count=10,
        impact_score=3.0,
        confidence_score=0.90,
        effort_score=1.5,
        wsjf_cod=12,
        wsjf_duration=4,
        ice_ease=6.0,
        kano_category="Performance Feature",
    )
    c2 = PrioritizeClusterInput(
        cluster_id="CLU-B",
        theme_title="High WSJF Cluster",
        reach_count=4,
        impact_score=2.0,
        confidence_score=0.80,
        effort_score=2.0,
        wsjf_cod=30,
        wsjf_duration=1,
        ice_ease=9.5,
        kano_category="Must-Be",
    )

    rice_ranked = score_and_rank_clusters([c2, c1], framework="RICE")
    assert rice_ranked[0].cluster_id == "CLU-A"
    assert rice_ranked[0].computed_rice == 18.0
    assert rice_ranked[1].computed_rice == 3.2

    wsjf_ranked = score_and_rank_clusters([c1, c2], framework="WSJF")
    assert wsjf_ranked[0].cluster_id == "CLU-B"
    assert wsjf_ranked[0].computed_wsjf == 30.0

    kano_ranked = score_and_rank_clusters([c1, c2], framework="KANO")
    assert kano_ranked[0].cluster_id == "CLU-B"
    assert kano_ranked[0].kano_category == "Must-Be"


def test_unit_economics_deterministic_math() -> None:
    payload = UnitEconomicsInput(
        arpu_monthly=150.0,
        cac=450.0,
        monthly_churn_pct=2.5,
        tickets_per_tenant_month=2000,
        prds_per_tenant_month=20,
        gemini_cost_per_1m_tokens=0.15,
        base_cloud_cogs_per_tenant=5.0,
    )
    res = calculate_unit_economics(payload)
    # 2000*420 + 20*4500 = 840,000 + 90,000 = 930,000 tokens = 0.93M * $0.15 = $0.14
    assert res.llm_inference_burn_monthly == pytest.approx(0.14, abs=0.01)
    assert res.total_cogs_monthly == pytest.approx(5.14, abs=0.01)
    assert res.blended_gross_margin_pct > 95.0
    assert res.ltv_cac_ratio > 10.0
    assert res.health_verdict == "ELITE_SAAS"
