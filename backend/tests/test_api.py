"""End-to-end FastAPI TestClient verification of all REST endpoints and multi-model routing."""

import asyncio
from fastapi.testclient import TestClient
from app.main import app

client = TestClient(app)


def test_healthcheck_endpoint() -> None:
    resp = client.get("/health")
    assert resp.status_code == 200
    data = resp.json()
    assert data["status"] == "ok"
    assert data["deterministic_math_boundary"] == "ENFORCED"


def test_env_status_and_8_stage_workflow_endpoints(monkeypatch) -> None:
    env_resp = client.get("/api/v1/env-status")
    assert env_resp.status_code == 200
    env_data = env_resp.json()
    assert env_data["light_model"] in (
        "nvidia/nemotron-3.5-lightning-30b-a3b",
        "nvidia/nemotron-3.5-lightning:free",
    )
    assert env_data["strong_model"] == "moonshotai/kimi-k3.1-pro"
    assert env_data["kimi_primary_timeout_seconds"] <= 8.0

    # Isolate deterministic pipeline contract test from live network calls
    from app.services import clustering_service, prd_service, workflow_service

    monkeypatch.setattr(workflow_service, "is_openrouter_configured", lambda: False)
    monkeypatch.setattr(workflow_service, "is_openrouter_key_present", lambda: False)
    monkeypatch.setattr(clustering_service, "is_openrouter_configured", lambda: False)
    monkeypatch.setattr(prd_service, "is_openrouter_configured", lambda: False)

    sample_resp = client.get("/api/v1/sample-tickets")
    assert sample_resp.status_code == 200
    tickets = sample_resp.json()

    # Stage 2: Noise & Enrichment
    noise_resp = client.post(
        "/api/v1/stages/noise",
        json={"project_id": "proj-enterprise-core", "tickets": tickets},
    )
    assert noise_resp.status_code == 200
    noise_data = noise_resp.json()
    assert noise_data["total_count"] == 30
    assert noise_data["signal_count"] == 30

    # Stage 3 & 4: Intent, Root Cause & Verified Citations
    triage_resp = client.post(
        "/api/v1/stages/triage",
        json={"project_id": "proj-enterprise-core", "tickets": tickets},
    )
    assert triage_resp.status_code == 200
    triage_data = triage_resp.json()
    assert len(triage_data["clusters"]) == 5
    for clu in triage_data["clusters"]:
        assert len(clu["verified_citations"]) >= 1
        assert clu["root_cause"] != ""

    # Stage 7 & Stage 8
    rv_resp = client.get("/api/v1/stages/release-validation")
    assert rv_resp.status_code == 200
    assert len(rv_resp.json()) >= 2

    lc_resp = client.get("/api/v1/stages/loop-closure")
    assert lc_resp.status_code == 200
    assert len(lc_resp.json()) >= 1

    # Home AI Co-Pilot with citations
    chat_resp = client.post(
        "/api/v1/copilot/chat",
        json={
            "project_id": "proj-enterprise-core",
            "project_name": "CollabSense Core OS",
            "okr_focus": "Reduce Enterprise SAML churn",
            "prompt": "What is our top P0 Enterprise SAML blocker?",
            "tickets": tickets,
        },
    )
    assert chat_resp.status_code == 200
    chat_data = chat_resp.json()
    assert len(chat_data["citations"]) >= 1
    assert "TCK-101" in chat_data["citations"]


def test_sample_tickets_and_clustering_pipeline(monkeypatch) -> None:
    from app.services import clustering_service, prd_service

    monkeypatch.setattr(clustering_service, "is_openrouter_configured", lambda: False)
    monkeypatch.setattr(prd_service, "is_openrouter_configured", lambda: False)

    sample_resp = client.get("/api/v1/sample-tickets")
    assert sample_resp.status_code == 200
    tickets = sample_resp.json()
    assert len(tickets) == 30

    cluster_resp = client.post(
        "/api/v1/cluster",
        json={"batch_name": "Pytest 30-Row Batch", "tickets": tickets},
    )
    assert cluster_resp.status_code == 200
    clustered = cluster_resp.json()
    assert clustered["total_tickets"] == 30
    assert len(clustered["clusters"]) == 5

    # Verify 100% ticket attribution across clusters
    mapped_ids = [tid for c in clustered["clusters"] for tid in c["ticket_ids"]]
    assert len(mapped_ids) == 30

    # Test deterministic re-prioritization endpoint
    prio_resp = client.post(
        "/api/v1/prioritize",
        json={"framework": "WSJF", "clusters": clustered["clusters"]},
    )
    assert prio_resp.status_code == 200
    prio_data = prio_resp.json()
    assert prio_data["framework"] == "WSJF"

    # Test PRD generation & interactive refinement endpoints
    top_cluster = clustered["clusters"][0]
    prd_resp = client.post(
        "/api/v1/generate-prd",
        json={"cluster": top_cluster, "pm_notes": "Enforce strict SOC2 audit logging."},
    )
    assert prd_resp.status_code == 200
    prd_data = prd_resp.json()
    assert "```gherkin" in prd_data["markdown_body"]
    assert len(prd_data["user_stories"]) >= 3

    prd_chat_resp = client.post(
        "/api/v1/prd/chat",
        json={
            "cluster": top_cluster,
            "current_prd": prd_data,
            "instruction": "Add a security edge case verifying strict rate limiting on SSO callbacks.",
        },
    )
    assert prd_chat_resp.status_code == 200
    prd_chat_data = prd_chat_resp.json()
    assert "defensive_edge_cases" in prd_chat_data["changed_sections"]
    assert prd_chat_data["updated_prd"]["deterministic_metrics_badge"]["rice"] == top_cluster["computed_rice"]


def test_two_tier_openrouter_models_and_anti_hallucination(monkeypatch) -> None:
    """Verifies light/cluster/heavy routing, rich taxonomy, blank chat, & Stages 2-8."""
    from app.services import clustering_service, prd_service, workflow_service

    env_data = client.get("/api/v1/env-status").json()
    assert env_data["light_model"] in (
        "nvidia/nemotron-3.5-lightning-30b-a3b",
        "nvidia/nemotron-3.5-lightning:free",
    )
    assert env_data["strong_model"] == "moonshotai/kimi-k3.1-pro"

    tickets = client.get("/api/v1/sample-tickets").json()
    called_tiers: list[str] = []

    async def fake_call_openrouter_json(*, tier, system_prompt, user_prompt, **kwargs):
        called_tiers.append(tier)
        if "Stage 2 Noise Filter" in system_prompt:
            return {
                "items": [
                    {
                        "id": "TCK-101",
                        "is_noise": False,
                        "noise_category": None,
                        "noise_reason": None,
                        "intent": "Security & Compliance",
                        "urgency": "Critical",
                        "account_context": "Enterprise CISO Priority • $120,000 ARR",
                    }
                ]
            }
        if "Release Reliability PM" in system_prompt:
            return {
                "regression_summary": "v2.4.0-hotfix cut daily SAML tickets by -80.0% across Enterprise workspaces."
            }
        if "Closing-the-Loop Communications Lead" in system_prompt:
            return {
                "drafts": [
                    {
                        "cluster_id": "CLU-01",
                        "channel": "Zendesk",
                        "subject": "[Shipped] Multi-Domain Okta SAML Fix",
                        "message_body": "Hi team — your reported issue [TCK-101] has been resolved in v2.4.0-hotfix.",
                        "internal_playbook_note": "Support/Sales: SAML fix shipped; close dupes against CLU-01.",
                    }
                ]
            }
        if "Interactive PRD Assistant" in system_prompt:
            return {
                "assistant_reply": "Added SOC2 audit logging edge case and tightened the executive summary.",
                "changed_sections": ["executive_problem_statement", "defensive_edge_cases"],
                "prd": {
                    "title": "PRD: Live Kimi K3.1 Pro SAML Spec",
                    "executive_problem_statement": "Updated summary grounded in TCK-101 & TCK-107.",
                    "target_persona": "Enterprise Security Admin",
                    "strategic_narrative": "Unlocks enterprise expansion.",
                    "user_stories": [
                        {"scenario_id": "AC-01", "title": "SAML Assertion", "given": "g1", "when": "w1", "then": "t1"},
                        {"scenario_id": "AC-02", "title": "SCIM Revocation", "given": "g2", "when": "w2", "then": "t2"},
                        {"scenario_id": "AC-03", "title": "Audit Log", "given": "g3", "when": "w3", "then": "t3"},
                    ],
                    "defensive_edge_cases": ["Edge 1", "Edge 2", "SOC2 Audit Trail Enforcement"],
                    "telemetry_events": [
                        {"event_name": "saml_ok", "properties": ["tenant_id"], "success_threshold": "<450ms"},
                        {"event_name": "saml_err", "properties": ["code"], "success_threshold": "<0.2%"},
                    ],
                    "rollout_plan": ["Phase 1", "Phase 2", "Phase 3"],
                },
            }
        if "Principal Product Architect" in system_prompt:
            return {
                "clusters": [
                    {
                        "cluster_id": "CLU-01",
                        "intent_category": "Integration & API",
                        "sub_category": "Multi-Domain SAML Assertion",
                        "product_area": "Enterprise IAM & SSO",
                        "affected_persona": "CISO / IT Admin",
                        "user_journey_stage": "Authentication",
                        "churn_risk": "Critical",
                        "sentiment": "Urgent / Blocking",
                        "tags": ["SAML", "Okta", "SCIM"],
                        "suggested_owner": "Identity Platform",
                        "theme_title": "Multi-Domain Okta SAML Blocking Login",
                        "problem_summary": "Live synthesized SAML summary.",
                        "root_cause": "Live root cause for multi-domain Okta SAML.",
                        "workaround_available": "None for secondary domains",
                        "severity": "P0",
                        "verified_citations": ["TCK-101", "TCK-999999"],
                    }
                ]
            }
        if "AI Co-Pilot" in system_prompt:
            if '"tickets_count": 0' in user_prompt:
                return {
                    "reply": "Hi! No feedback uploaded yet — drop a CSV or JSON batch in Stage 1 to begin.",
                    "citations": ["TCK-999999"],
                    "suggested_stage": "upload",
                }
            return {
                "reply": "Live co-pilot answer grounded in TCK-101.",
                "citations": ["TCK-101", "TCK-FAKE-999"],
                "suggested_stage": "triage",
            }
        return {
            "title": "PRD: Live Kimi K3.1 Pro SAML Spec",
            "executive_problem_statement": "Grounded in TCK-101 and TCK-107.",
            "target_persona": "Enterprise Security Admin",
            "strategic_narrative": "Unlocks enterprise expansion.",
            "user_stories": [
                {"scenario_id": "AC-01", "title": "SAML Assertion", "given": "g1", "when": "w1", "then": "t1"},
                {"scenario_id": "AC-02", "title": "SCIM Revocation", "given": "g2", "when": "w2", "then": "t2"},
                {"scenario_id": "AC-03", "title": "Audit Log", "given": "g3", "when": "w3", "then": "t3"},
            ],
            "defensive_edge_cases": ["Edge 1", "Edge 2", "Edge 3"],
            "telemetry_events": [
                {"event_name": "saml_ok", "properties": ["tenant_id"], "success_threshold": "<450ms"},
                {"event_name": "saml_err", "properties": ["code"], "success_threshold": "<0.2%"},
            ],
            "rollout_plan": ["Phase 1", "Phase 2", "Phase 3"],
        }

    monkeypatch.setattr(workflow_service, "is_openrouter_configured", lambda: True)
    monkeypatch.setattr(workflow_service, "is_openrouter_key_present", lambda: False)
    monkeypatch.setattr(workflow_service, "call_openrouter_json", fake_call_openrouter_json)
    monkeypatch.setattr(clustering_service, "is_openrouter_configured", lambda: True)
    monkeypatch.setattr(clustering_service, "call_openrouter_json", fake_call_openrouter_json)
    monkeypatch.setattr(prd_service, "is_openrouter_configured", lambda: True)
    monkeypatch.setattr(prd_service, "call_openrouter_json", fake_call_openrouter_json)

    # 1. Stage 2 uses light tier
    s2 = client.post("/api/v1/stages/noise", json={"project_id": "p1", "tickets": tickets}).json()
    assert s2["total_count"] == 30
    assert s2["tickets"][0]["account_context"] == "Enterprise CISO Priority • $120,000 ARR"

    # 2. Stage 3 & 4 uses cluster tier, unrestricted intent_category, rich metadata, & strips fake TCK-999999
    s4 = client.post("/api/v1/stages/triage", json={"project_id": "p1", "tickets": tickets}).json()
    clu01 = next(c for c in s4["clusters"] if c["cluster_id"] == "CLU-01")
    assert clu01["intent_category"] == "Integration & API"
    assert clu01["product_area"] == "Enterprise IAM & SSO"
    assert clu01["suggested_owner"] == "Identity Platform"
    assert clu01["churn_risk"] == "Critical"
    assert "TCK-101" in clu01["verified_citations"]
    assert "TCK-999999" not in clu01["verified_citations"]

    # 3a. Home Co-Pilot on blank project answers cleanly & strips any hallucinated citations
    blank_chat = client.post(
        "/api/v1/copilot/chat",
        json={
            "project_id": "p-blank",
            "project_name": "Fresh Project",
            "okr_focus": "General PM",
            "prompt": "Hello! What should I do first?",
            "tickets": [],
            "clusters": [],
        },
    ).json()
    assert "Stage 1" in blank_chat["reply"]
    assert blank_chat["citations"] == []

    # 3b. Home Co-Pilot on populated project receives clusters + tickets & strips fake TCK-FAKE-999
    chat = client.post(
        "/api/v1/copilot/chat",
        json={
            "project_id": "p1",
            "project_name": "Core",
            "okr_focus": "SAML",
            "prompt": "Summarize SAML blockers",
            "tickets": tickets,
            "clusters": s4["clusters"],
        },
    ).json()
    assert chat["citations"] == ["TCK-101"]

    # 4. Stage 6 PRD Studio generate & interactive chat refinement
    prd = client.post("/api/v1/generate-prd", json={"cluster": clu01, "pm_notes": ""}).json()
    assert prd["deterministic_metrics_badge"]["rice"] == clu01["computed_rice"]
    prd_refined = client.post(
        "/api/v1/prd/chat",
        json={"cluster": clu01, "current_prd": prd, "instruction": "Add SOC2 audit requirement"},
    ).json()
    assert "defensive_edge_cases" in prd_refined["changed_sections"]
    assert "SOC2 Audit Trail Enforcement" in prd_refined["updated_prd"]["markdown_body"]

    # 5. Stage 7 Validate Release computes deterministic delta & uses light AI summary
    rv = client.post(
        "/api/v1/stages/validate-release",
        json={
            "cluster_id": clu01["cluster_id"],
            "theme_title": clu01["theme_title"],
            "release_tag": "v2.4.0-hotfix",
            "pre_release_daily_tickets": 5.0,
            "post_release_daily_tickets": 1.0,
            "post_release_notes": "Deployed multi-domain SAML fix behind flag.",
            "citations": ["TCK-101"],
        },
    ).json()
    assert rv["delta_pct"] == -80.0
    assert rv["verdict"] == "VERIFIED_RESOLVED"

    # 6. Stage 8 Loop Closure
    lc = client.post(
        "/api/v1/stages/loop-closure/generate",
        json={"project_name": "Core", "clusters": [clu01]},
    ).json()
    assert len(lc) == 1
    assert lc[0]["internal_playbook_note"]
    assert "light" in called_tiers and "cluster" in called_tiers and "heavy" in called_tiers


def test_kimi_8s_timeout_fallback_and_per_model_cooldown(monkeypatch) -> None:
    """Verifies Kimi K3.1 Pro stalling hits fast NIM/OR fallback & HTTP 429 cools down ONLY the offending model."""
    from app.services import openrouter_service
    from app.config import settings

    openrouter_service._model_cooldown_until.clear()
    monkeypatch.setattr(openrouter_service, "is_nvidia_configured", lambda: True)
    monkeypatch.setattr(openrouter_service, "is_openrouter_key_present", lambda: True)
    monkeypatch.setattr(settings, "kimi_primary_timeout_seconds", 0.05)

    attempted: list[str] = []

    async def fake_nim(*, model, timeout_seconds, **kwargs):
        attempted.append(f"nim:{model}")
        if "kimi" in model:
            await asyncio.sleep(0.15)
            openrouter_service._trip_nvidia_kimi_cooldown(180.0)
            return None
        return '{"reply": "Fast NIM 120B answer", "citations": [], "suggested_stage": "upload"}'

    async def fake_or(*, model, **kwargs):
        attempted.append(f"or:{model}")
        if model == settings.openrouter_super_model:
            openrouter_service._trip_model_cooldown(model, 120.0, reason="HTTP 429")
            return None
        return '{"reply": "Fast OR Lightning answer", "citations": [], "suggested_stage": "upload"}'

    monkeypatch.setattr(openrouter_service, "_call_nvidia_nim_chat", fake_nim)
    monkeypatch.setattr(openrouter_service, "_call_openrouter_chat", fake_or)

    parsed, used_model = asyncio.run(
        openrouter_service.call_ai_json_with_meta(
            tier="heavy",
            system_prompt="s",
            user_prompt="u",
            allow_text_fallback=True,
        )
    )
    assert parsed is not None
    assert parsed["reply"] == "Fast NIM 120B answer"
    assert used_model == settings.nvidia_super_model
    assert attempted[0] == f"nim:{settings.openrouter_strong_model}"
    assert openrouter_service.is_nvidia_kimi_cooling_down()

    # Second scenario: NIM disabled + HTTP 429 on openrouter_super_model cools ONLY that model,
    # allowing openrouter_light_model to succeed immediately without marking all OpenRouter rate-limited.
    openrouter_service._model_cooldown_until.clear()
    monkeypatch.setattr(openrouter_service, "is_nvidia_configured", lambda: False)
    parsed_or, used_or_model = asyncio.run(
        openrouter_service.call_ai_json_with_meta(
            tier="heavy",
            system_prompt="s",
            user_prompt="u",
            allow_text_fallback=True,
        )
    )
    assert parsed_or is not None
    assert parsed_or["reply"] == "Fast OR Lightning answer"
    assert used_or_model == settings.openrouter_light_model
    assert openrouter_service.is_model_cooling_down(settings.openrouter_super_model)
    assert not openrouter_service.is_openrouter_rate_limited()
    openrouter_service._model_cooldown_until.clear()


def test_stage2_250_tickets_full_coverage_and_noise_accuracy(monkeypatch) -> None:
    """Verifies Stage 2 handles 250 tickets (no 60-row truncation) and separates noise accurately."""
    from app.services import workflow_service

    monkeypatch.setattr(workflow_service, "is_openrouter_configured", lambda: False)
    batch = []
    for i in range(1, 251):
        if i <= 30:
            txt = "Out of office automatic reply: I am on vacation until Monday."
        elif i <= 50:
            txt = "Please unsubscribe me from marketing emails and newsletter."
        else:
            txt = f"Enterprise Slack webhook sync bug fails with HTTP 500 on export batch #{i}."
        batch.append(
            {
                "id": f"ROW-{i:03d}",
                "source": "CSV",
                "customer_tier": "Enterprise",
                "arr_weight": 0,
                "content": txt,
            }
        )

    resp = client.post("/api/v1/stages/noise", json={"project_id": "p-250", "tickets": batch})
    assert resp.status_code == 200
    data = resp.json()
    assert data["total_count"] == 250
    assert data["noise_count"] == 50
    assert data["signal_count"] == 200
    assert len(data["tickets"]) == 250


def test_stage3_large_batch_map_reduce_100pct_attribution(monkeypatch) -> None:
    """Verifies >55 tickets trigger Pass 1 + Pass 2 semantic attribution across all 85 items."""
    from app.services import clustering_service

    monkeypatch.setattr(clustering_service, "is_openrouter_configured", lambda: False)
    batch = [
        {
            "id": f"SIG-{i:03d}",
            "source": "Zendesk" if i % 2 == 0 else "Intercom",
            "customer_tier": "Enterprise" if i % 3 == 0 else "Pro",
            "arr_weight": 0,
            "content": (
                f"SAML Okta SCIM SSO fails on domain {i}"
                if i % 3 == 0
                else f"Linear webhook integration API error during export #{i}"
            ),
        }
        for i in range(1, 86)
    ]
    resp = client.post("/api/v1/cluster", json={"batch_name": "Large 85 Batch", "tickets": batch})
    assert resp.status_code == 200
    data = resp.json()
    assert data["total_tickets"] == 85
    mapped = [tid for c in data["clusters"] for tid in c["ticket_ids"]]
    assert len(mapped) == 85


def test_openrouter_strict_free_allowlist_blocks_kimi(monkeypatch) -> None:
    """Guarantees OpenRouter only ever calls `:free` models and blocks Kimi K3.1 Pro."""
    import httpx
    from app.services import openrouter_service

    env_data = client.get("/api/v1/env-status").json()
    assert env_data["strong_provider"] == "nvidia-nim"
    assert all(m.endswith(":free") for m in env_data["openrouter_allowed_models"])
    assert "moonshotai/kimi-k3.1-pro" not in env_data["openrouter_allowed_models"]

    def _forbid_http(*args, **kwargs):
        raise AssertionError("HTTP must not be called")

    monkeypatch.setattr(openrouter_service, "is_openrouter_key_present", lambda: True)
    monkeypatch.setattr(httpx, "AsyncClient", _forbid_http)

    res = asyncio.run(
        openrouter_service._call_openrouter_chat(
            model="moonshotai/kimi-k3.1-pro",
            system_prompt="s",
            user_prompt="u",
        )
    )
    assert res is None


def test_spa_serving_and_unknown_api_404() -> None:
    """Verifies unified SPA runtime env injection when dist exists and 404 on unknown /api paths."""
    from pathlib import Path

    missing_api = client.get("/api/v1/does-not-exist")
    assert missing_api.status_code == 404

    dist_index = Path(__file__).resolve().parents[2] / "frontend" / "dist" / "index.html"
    if dist_index.is_file():
        root_resp = client.get("/")
        assert root_resp.status_code == 200
        assert "window.__COLLABSENSE_ENV__" in root_resp.text
