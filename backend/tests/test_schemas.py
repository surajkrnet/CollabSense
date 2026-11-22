"""
Validation tests for Pydantic v2 JSON schema compliance, qualitative bounds enforcement,
CSV formula-injection sanitization, and the 30-row multi-channel dataset.
"""

import pytest
from pydantic import ValidationError
from app.data.sample_tickets import SAMPLE_30_TICKETS
from app.schemas import LLMQualitativeCluster, RawTicket, sanitize_formula_injection


def test_sample_dataset_has_30_multi_channel_rows() -> None:
    assert len(SAMPLE_30_TICKETS) == 30
    sources = {t.source for t in SAMPLE_30_TICKETS}
    assert {"Zendesk", "Discord", "Linear", "AppStore"}.issubset(sources)


def test_formula_injection_sanitization() -> None:
    malicious = "=CMD|' /C calc'!A0Malicious ticket payload"
    sanitized = sanitize_formula_injection(malicious)
    assert not sanitized.startswith("=")
    assert sanitized.startswith("CMD")

    ticket = RawTicket(
        id="=TCK-999",
        source="CSV",
        customer_tier="Pro",
        content="+=@SUM(A1:A10) Urgent SSO failure when logging in",
    )
    assert ticket.id == "TCK-999"
    assert ticket.content == "SUM(A1:A10) Urgent SSO failure when logging in"


def test_llm_qualitative_cluster_strict_bounds() -> None:
    valid = LLMQualitativeCluster(
        cluster_id="CLU-01",
        theme_title="Enterprise SSO Failure",
        problem_summary="SAML 2.0 handshake fails on Okta.",
        severity="P0",
        ticket_ids=["TCK-101", "TCK-102"],
        representative_quotes=["Okta SAML 2.0 assertion fails"],
        impact_score=2.8,
        effort_score=2.0,
        confidence_score=0.92,
    )
    assert valid.impact_score == 2.8

    # Out-of-bounds impact_score (> 3.0) must be rejected by Pydantic v2
    with pytest.raises(ValidationError):
        LLMQualitativeCluster(
            cluster_id="CLU-01",
            theme_title="Invalid Impact",
            problem_summary="Summary",
            severity="P0",
            ticket_ids=["TCK-101"],
            representative_quotes=["Quote"],
            impact_score=4.5,
            effort_score=2.0,
            confidence_score=0.9,
        )

    # Out-of-bounds confidence_score (> 1.0) must be rejected by Pydantic v2
    with pytest.raises(ValidationError):
        LLMQualitativeCluster(
            cluster_id="CLU-01",
            theme_title="Invalid Confidence",
            problem_summary="Summary",
            severity="P0",
            ticket_ids=["TCK-101"],
            representative_quotes=["Quote"],
            impact_score=2.0,
            effort_score=2.0,
            confidence_score=1.5,
        )
