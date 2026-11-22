"""
Autonomous Gherkin PRD Synthesis & Interactive Stage 6 PRD Co-Pilot Service.
Enforces strict Pydantic response schema (LLMPRDSynthesisSchema) while embedding
deterministic RICE / WSJF / ICE metrics computed by scorer_service.
"""

import json
import logging
import time
from typing import Any, Dict, List
from app.config import settings
from app.schemas import (
    FeedbackCluster,
    GeneratedPRD,
    GherkinScenario,
    LLMPRDSynthesisSchema,
    PRDChatRequest,
    PRDChatResponse,
    TelemetryEventSpec,
)
from app.services.openrouter_service import (
    call_openrouter_json,
    get_model_for_tier,
    is_openrouter_configured,
    last_ai_model_var,
)

PRD_SYSTEM_PROMPT = """You are a Staff Product Manager at a CollabSense-caliber engineering organization.
Draft a rigorous, engineering-ready Product Requirements Document (PRD) for the provided problem cluster.
Include concrete Gherkin Acceptance Criteria (Given/When/Then), defensive edge cases, and CollabSense telemetry events.
Do not invent or alter the deterministic prioritization scores provided.
"""

PRD_CHAT_SYSTEM_PROMPT = """You are the CollabSense Stage 6 Interactive PRD Assistant.
Help the PM interactively draft, refine, expand, or tighten the live Product Requirements Document (PRD).
Cite ONLY real ticket IDs from the cluster and NEVER modify or invent deterministic RICE/WSJF/ICE scores or ARR numbers.
Return ONLY a valid JSON object:
{
  "assistant_reply": "1-3 concise sentences explaining the exact PRD changes made.",
  "changed_sections": ["executive_problem_statement" | "target_persona" | "strategic_narrative" | "user_stories" | "defensive_edge_cases" | "telemetry_events" | "rollout_plan" | "title"],
  "prd": {
    "title": "...",
    "executive_problem_statement": "...",
    "target_persona": "...",
    "strategic_narrative": "...",
    "user_stories": [{"scenario_id": "AC-01", "title": "...", "given": "...", "when": "...", "then": "..."}],
    "defensive_edge_cases": ["..."],
    "telemetry_events": [{"event_name": "snake_case_name", "properties": ["prop1", "prop2"], "success_threshold": "..."}],
    "rollout_plan": ["Phase 1...", "Phase 2...", "Phase 3..."]
  }
}"""

logger = logging.getLogger("collabsense.prd")


def _flatten_str_list(raw_items: Any, fallback_items: List[str], min_count: int) -> List[str]:
    result: List[str] = []
    if isinstance(raw_items, list):
        for item in raw_items:
            if isinstance(item, dict):
                joined = ": ".join(str(v).strip() for v in item.values() if v is not None and str(v).strip())
                if joined:
                    result.append(joined)
            else:
                text = str(item or "").strip()
                if text:
                    result.append(text)
    for fb in fallback_items:
        if len(result) >= min_count:
            break
        result.append(fb)
    return result


def _coerce_prd_schema(
    parsed: Dict[str, Any],
    cluster: FeedbackCluster,
    pm_notes: str,
    base_prd: GeneratedPRD | None = None,
) -> LLMPRDSynthesisSchema | None:
    """Normalizes varied LLM JSON shapes into strict LLMPRDSynthesisSchema without discarding valid PRDs."""
    if not isinstance(parsed, dict):
        return None
    fallback = (
        LLMPRDSynthesisSchema(
            title=base_prd.title,
            executive_problem_statement=base_prd.executive_problem_statement,
            target_persona=base_prd.target_persona,
            strategic_narrative=base_prd.strategic_narrative,
            user_stories=list(base_prd.user_stories),
            defensive_edge_cases=list(base_prd.defensive_edge_cases),
            telemetry_events=list(base_prd.telemetry_events),
            rollout_plan=list(base_prd.rollout_plan),
        )
        if base_prd is not None
        else _build_deterministic_prd_schema(cluster=cluster, pm_notes=pm_notes)
    )

    raw_stories: List[GherkinScenario] = []
    if isinstance(parsed.get("user_stories"), list):
        for idx, st in enumerate(parsed["user_stories"], start=1):
            if not isinstance(st, dict):
                continue
            given = str(st.get("given") or "").strip()
            when = str(st.get("when") or "").strip()
            then = str(st.get("then") or "").strip()
            if not (given and when and then):
                continue
            sid = str(st.get("scenario_id") or (f"AC-0{idx}" if idx < 10 else f"AC-{idx}")).strip()
            st_title = str(st.get("title") or f"Acceptance Criterion {idx}").strip()
            raw_stories.append(
                GherkinScenario(scenario_id=sid, title=st_title, given=given, when=when, then=then)
            )

    title_str = str(parsed.get("title") or "").strip()
    exec_stmt = str(parsed.get("executive_problem_statement") or "").strip()
    if not title_str or (not exec_stmt and not raw_stories):
        return None

    for fb_story in fallback.user_stories:
        if len(raw_stories) >= 3:
            break
        raw_stories.append(fb_story)

    raw_telemetry: List[TelemetryEventSpec] = []
    if isinstance(parsed.get("telemetry_events"), list):
        for idx, ev in enumerate(parsed["telemetry_events"], start=1):
            if not isinstance(ev, dict):
                continue
            ev_name = str(ev.get("event_name") or "").strip()
            if not ev_name:
                continue
            raw_props = ev.get("properties")
            if isinstance(raw_props, list):
                props = [str(p).strip() for p in raw_props if str(p).strip()]
            elif isinstance(raw_props, str):
                props = [p.strip() for p in raw_props.split(",") if p.strip()]
            else:
                props = ["cluster_id", "tenant_tier"]
            if not props:
                props = ["cluster_id", "tenant_tier"]
            sla = str(ev.get("success_threshold") or "p95 latency < 500ms").strip()
            raw_telemetry.append(
                TelemetryEventSpec(event_name=ev_name, properties=props, success_threshold=sla)
            )
    for fb_ev in fallback.telemetry_events:
        if len(raw_telemetry) >= 2:
            break
        raw_telemetry.append(fb_ev)

    edge_cases = _flatten_str_list(parsed.get("defensive_edge_cases"), fallback.defensive_edge_cases, 3)
    rollout = _flatten_str_list(parsed.get("rollout_plan"), fallback.rollout_plan, 3)

    try:
        return LLMPRDSynthesisSchema(
            title=title_str,
            executive_problem_statement=exec_stmt or fallback.executive_problem_statement,
            target_persona=str(parsed.get("target_persona") or fallback.target_persona).strip(),
            strategic_narrative=str(parsed.get("strategic_narrative") or fallback.strategic_narrative).strip(),
            user_stories=raw_stories,
            defensive_edge_cases=edge_cases,
            telemetry_events=raw_telemetry,
            rollout_plan=rollout,
        )
    except Exception as exc:
        logger.warning("PRD schema coercion failed for %s: %s", cluster.cluster_id, repr(exc))
        return None


def _build_deterministic_prd_schema(cluster: FeedbackCluster, pm_notes: str = "") -> LLMPRDSynthesisSchema:
    """High-precision structured Gherkin PRD synthesis aligned to the specific cluster."""
    slug = cluster.cluster_id.lower().replace("-", "_")
    notes_clause = f" Incorporates PM directive: {pm_notes.strip()}." if pm_notes.strip() else ""

    arr_clause = (
        f" representing ${cluster.total_arr_impact:,.0f} in attributed ARR"
        if cluster.total_arr_impact > 0
        else ""
    )
    persona = cluster.affected_persona or (
        "Enterprise Security Architects, Staff Product Managers, and Platform Engineering Leads "
        "operating multi-workspace B2B SaaS environments."
    )
    return LLMPRDSynthesisSchema(
        title=f"PRD: {cluster.theme_title}",
        executive_problem_statement=(
            f"{cluster.problem_summary} Directly evidenced across {cluster.reach_count} customer tickets "
            f"({', '.join(cluster.ticket_ids[:6])}) spanning {', '.join(cluster.channels or ['Multi-Channel'])}"
            f"{arr_clause}.{notes_clause}"
        ),
        target_persona=persona,
        strategic_narrative=(
            f"Classified as {cluster.moscow_tag} ({cluster.kano_category}) with a deterministic RICE score of "
            f"{cluster.computed_rice} and WSJF of {cluster.computed_wsjf}. Shipping this capability removes immediate "
            "enterprise expansion blockers and reduces manual support triage overhead by >78%."
        ),
        user_stories=[
            GherkinScenario(
                scenario_id="AC-01",
                title="Primary Happy-Path Execution & Sub-Second SLA",
                given=(
                    f"an authenticated workspace tenant triggers the {cluster.theme_title} workflow "
                    f"with valid payload parameters"
                ),
                when="the request is processed by the FastAPI validation and persistence pipeline",
                then=(
                    "the operation completes deterministically within < 450ms p95 latency, updates state in "
                    "Supabase PostgreSQL under RLS, and emits a verified CollabSense telemetry event"
                ),
            ),
            GherkinScenario(
                scenario_id="AC-02",
                title="Idempotency, Concurrency & Retry Guardrail",
                given="duplicate or concurrent requests arrive within a 5-second window carrying the same idempotency key",
                when="the backend deduplication middleware inspects the transaction fingerprint",
                then="the system upserts the existing record without creating duplicate artifacts and returns HTTP 200 OK",
            ),
            GherkinScenario(
                scenario_id="AC-03",
                title="Malformed Input & Security Boundary Enforcement",
                given="an unauthenticated actor or malformed payload attempts to bypass tenant or schema constraints",
                when="Pydantic v2 schema validation and Supabase Row-Level Security (RLS) evaluate the request",
                then="execution halts immediately with a structured HTTP 422/403 diagnostic error and zero state mutation",
            ),
        ],
        defensive_edge_cases=[
            "Network partition or upstream provider 504 timeout mid-transaction: enforce exponential backoff (3 retries, jitter) and atomic rollback.",
            "CSV/Payload formula injection (`=`, `+`, `-`, `@` prefixes) or UTF-8 BOM byte sequences: strip unsafe prefixes before DB persistence.",
            "Concurrent multi-tab edits by two PMs on the same cluster: enforce optimistic concurrency control via `updated_at` version check.",
            "Zero-value or boundary denominator parameters during re-calibration: clamp `Effort >= 0.1` and `Duration >= 1` in pure Python/SQL.",
        ],
        telemetry_events=[
            TelemetryEventSpec(
                event_name=f"collabsense_{slug}_executed",
                properties=["cluster_id", "tenant_tier", "latency_ms", "rice_score", "ticket_count"],
                success_threshold="p95 latency < 450ms and >= 99.5% success rate over 7-day rolling window",
            ),
            TelemetryEventSpec(
                event_name=f"collabsense_{slug}_error_boundary",
                properties=["cluster_id", "error_code", "retry_attempt", "source_channel"],
                success_threshold="< 0.2% error rate across Enterprise and Mid-Market workspaces",
            ),
        ],
        rollout_plan=[
            "Phase 1 (Internal Dogfood & Pytest Gate): 100% unit test coverage + staging soak test across sample multi-channel datasets.",
            "Phase 2 (Design Partner Canary - 10% Tenants): Enable behind feature flag with real-time error budget alerting.",
            "Phase 3 (General Availability): Roll out to 100% of workspaces with automated issue tracker synchronization.",
        ],
    )


def render_prd_markdown(
    cluster: FeedbackCluster,
    spec: LLMPRDSynthesisSchema,
) -> str:
    """Renders a crisp, copy/export-ready Markdown document with Gherkin code blocks."""
    quotes_md = "\n".join(f'> "{q}"' for q in cluster.representative_quotes)
    stories_md = "\n\n".join(
        f"### {s.scenario_id}: {s.title}\n"
        f"```gherkin\n"
        f"Feature: {spec.title}\n"
        f"  Scenario: {s.title}\n"
        f"    Given {s.given}\n"
        f"    When {s.when}\n"
        f"    Then {s.then}\n"
        f"```"
        for s in spec.user_stories
    )
    edges_md = "\n".join(f"- **[DEFENSIVE GUARD]** {edge}" for edge in spec.defensive_edge_cases)
    telemetry_md = "\n".join(
        f"- `{ev.event_name}` — **Props**: `{', '.join(ev.properties)}` | **SLA**: {ev.success_threshold}"
        for ev in spec.telemetry_events
    )
    rollout_md = "\n".join(f"{idx}. {step}" for idx, step in enumerate(spec.rollout_plan, start=1))

    arr_row = (
        f"| **Attributed Tickets & ARR** | `{', '.join(cluster.ticket_ids[:12])}` (${cluster.total_arr_impact:,.0f} ARR) |"
        if cluster.total_arr_impact > 0
        else f"| **Attributed Tickets** | `{', '.join(cluster.ticket_ids[:12])}` ({len(cluster.ticket_ids)} total) |"
    )
    return f"""# {spec.title}

| Metric / Attribute | Deterministic Value |
| :--- | :--- |
| **Cluster ID** | `{cluster.cluster_id}` |
| **Severity / MoSCoW / Kano** | `{cluster.severity}` / `{cluster.moscow_tag}` / `{cluster.kano_category}` |
| **Deterministic RICE Score** | **{cluster.computed_rice}** (`Reach={cluster.reach_count}, Impact={cluster.impact_score}, Conf={int(cluster.confidence_score * 100)}%, Effort={cluster.effort_score}`) |
| **Deterministic WSJF / ICE** | **WSJF: {cluster.computed_wsjf}** (`CoD={cluster.wsjf_cod}, Dur={cluster.wsjf_duration}`) / **ICE: {cluster.computed_ice}** |
{arr_row}

---

## 1. Executive Problem Statement
{spec.executive_problem_statement}

### Verbatim Customer Evidence
{quotes_md}

---

## 2. Target Persona & Strategic Narrative
- **Target Persona**: {spec.target_persona}
- **Strategic Narrative**: {spec.strategic_narrative}

---

## 3. Gherkin Acceptance Criteria (`Given / When / Then`)
{stories_md}

---

## 4. Defensive Edge Cases & Failure Modes
{edges_md}

---

## 5. CollabSense Telemetry & Success Metrics
{telemetry_md}

---

## 6. Phased Rollout Plan
{rollout_md}
"""


async def synthesize_prd(cluster: FeedbackCluster, pm_notes: str = "") -> GeneratedPRD:
    """Synthesizes a complete PRD using Heavyweight AI (with 8s Kimi fallback) + strict schema validation."""
    spec: LLMPRDSynthesisSchema | None = None
    engine_used = f"{settings.openrouter_strong_model} (deterministic-fallback)"

    if is_openrouter_configured():
        schema_hint = (
            "Return ONLY a compact JSON object matching this exact structure (keep strings concise): "
            "{title, executive_problem_statement, target_persona, strategic_narrative, "
            "user_stories: [{scenario_id, title, given, when, then}] (3 scenarios), "
            "defensive_edge_cases: [string] (3 concise guards), "
            "telemetry_events: [{event_name, properties: [string], success_threshold}] (2 events), "
            "rollout_plan: [string] (3 phases)}."
        )
        cluster_dump = cluster.model_dump()
        if cluster.total_arr_impact <= 0:
            cluster_dump.pop("total_arr_impact", None)
        cluster_dump["ticket_ids"] = cluster_dump.get("ticket_ids", [])[:15]
        prompt = (
            f"Generate an engineering-ready Gherkin PRD for this cluster:\n"
            f"{json.dumps(cluster_dump)}\n"
            f"Additional PM Notes: {pm_notes}\n"
            f"Always cite exact ticket IDs from cluster.ticket_ids. Do not invent ARR figures. {schema_hint}"
        )
        token = last_ai_model_var.set(None)
        try:
            parsed = await call_openrouter_json(
                tier="heavy",
                system_prompt=PRD_SYSTEM_PROMPT,
                user_prompt=prompt,
                temperature=0.15,
                timeout_seconds=16.0,
                max_tokens=1800,
            )
            resolved_model = last_ai_model_var.get() or settings.openrouter_strong_model
        finally:
            last_ai_model_var.reset(token)
        if parsed:
            coerced = _coerce_prd_schema(parsed, cluster=cluster, pm_notes=pm_notes)
            if coerced is not None:
                spec = coerced
                engine_used = resolved_model
            else:
                logger.warning("Parsed PRD JSON missing required fields for %s", cluster.cluster_id)

    if spec is None:
        spec = _build_deterministic_prd_schema(cluster=cluster, pm_notes=pm_notes)

    md_body = render_prd_markdown(cluster=cluster, spec=spec)
    return GeneratedPRD(
        prd_id=f"PRD-{cluster.cluster_id}",
        cluster_id=cluster.cluster_id,
        title=spec.title,
        executive_problem_statement=spec.executive_problem_statement,
        target_persona=spec.target_persona,
        strategic_narrative=spec.strategic_narrative,
        deterministic_metrics_badge={
            "rice": cluster.computed_rice,
            "wsjf": cluster.computed_wsjf,
            "ice": cluster.computed_ice,
            "moscow": cluster.moscow_tag,
            "kano": cluster.kano_category,
            "reach": cluster.reach_count,
            "arr_impact": cluster.total_arr_impact,
        },
        user_stories=spec.user_stories,
        defensive_edge_cases=spec.defensive_edge_cases,
        telemetry_events=spec.telemetry_events,
        rollout_plan=spec.rollout_plan,
        markdown_body=md_body,
        engine_used=engine_used,
    )


def _compute_changed_sections(prev: GeneratedPRD | None, nxt: LLMPRDSynthesisSchema) -> List[str]:
    if prev is None:
        return [
            "title",
            "executive_problem_statement",
            "target_persona",
            "strategic_narrative",
            "user_stories",
            "defensive_edge_cases",
            "telemetry_events",
            "rollout_plan",
        ]
    changed: List[str] = []
    if prev.title != nxt.title:
        changed.append("title")
    if prev.executive_problem_statement != nxt.executive_problem_statement:
        changed.append("executive_problem_statement")
    if prev.target_persona != nxt.target_persona:
        changed.append("target_persona")
    if prev.strategic_narrative != nxt.strategic_narrative:
        changed.append("strategic_narrative")
    if [s.model_dump() for s in prev.user_stories] != [s.model_dump() for s in nxt.user_stories]:
        changed.append("user_stories")
    if list(prev.defensive_edge_cases) != list(nxt.defensive_edge_cases):
        changed.append("defensive_edge_cases")
    if [e.model_dump() for e in prev.telemetry_events] != [e.model_dump() for e in nxt.telemetry_events]:
        changed.append("telemetry_events")
    if list(prev.rollout_plan) != list(nxt.rollout_plan):
        changed.append("rollout_plan")
    return changed


def _apply_deterministic_prd_instruction(
    prev: GeneratedPRD | None,
    cluster: FeedbackCluster,
    instruction: str,
) -> tuple[LLMPRDSynthesisSchema, str, List[str]]:
    base = (
        LLMPRDSynthesisSchema(
            title=prev.title,
            executive_problem_statement=prev.executive_problem_statement,
            target_persona=prev.target_persona,
            strategic_narrative=prev.strategic_narrative,
            user_stories=list(prev.user_stories),
            defensive_edge_cases=list(prev.defensive_edge_cases),
            telemetry_events=list(prev.telemetry_events),
            rollout_plan=list(prev.rollout_plan),
        )
        if prev is not None
        else _build_deterministic_prd_schema(cluster, instruction)
    )
    low = instruction.lower()
    changed: List[str] = []
    if "gherkin" in low or "story" in low or "acceptance" in low:
        next_num = len(base.user_stories) + 1
        base.user_stories.append(
            GherkinScenario(
                scenario_id=f"AC-0{next_num}" if next_num < 10 else f"AC-{next_num}",
                title="PM Requested Safeguard Scenario",
                given=f"a workspace tenant runs {cluster.theme_title} under edge conditions ({instruction[:60]})",
                when="the validation guard evaluates input & state invariants",
                then="the system preserves consistency, returns an actionable message, and logs telemetry",
            )
        )
        changed.append("user_stories")
    elif "edge" in low or "security" in low or "privacy" in low or "compliance" in low:
        base.defensive_edge_cases.append(f"PM Safeguard: {instruction.strip()[:160]}")
        changed.append("defensive_edge_cases")
    elif "telemetry" in low or "metric" in low or "kpi" in low:
        base.telemetry_events.append(
            TelemetryEventSpec(
                event_name=f"collabsense_{cluster.cluster_id.lower().replace('-', '_')}_kpi_check",
                properties=["cluster_id", "tenant_tier", "resolution_ms"],
                success_threshold=f"Aligned with PM target: {instruction.strip()[:80]}",
            )
        )
        changed.append("telemetry_events")
    elif "rollout" in low or "rollback" in low or "flag" in low:
        base.rollout_plan.append(f"Rollback & Canary Guard: {instruction.strip()[:160]}")
        changed.append("rollout_plan")
    else:
        base.executive_problem_statement = f"{base.executive_problem_statement} {instruction.strip()}"
        changed.append("executive_problem_statement")

    return (
        base,
        f"Updated {', '.join(changed)} in the live PRD based on your instruction.",
        changed,
    )


async def chat_refine_prd(payload: PRDChatRequest) -> PRDChatResponse:
    """
    Stage 6 Interactive PRD Assistant: drafts or incrementally updates the live PRD from PM chat
    instructions and reports exact `changed_sections` so the Live PRD Viewer highlights diffs immediately.
    """
    start_ts = time.perf_counter()
    cluster = payload.cluster
    prev_prd = payload.current_prd
    resolved_model = get_model_for_tier("cluster")
    spec: LLMPRDSynthesisSchema | None = None
    assistant_reply = ""
    declared_changes: List[str] = []

    if is_openrouter_configured():
        current_spec_json = (
            {
                "title": prev_prd.title,
                "executive_problem_statement": prev_prd.executive_problem_statement,
                "target_persona": prev_prd.target_persona,
                "strategic_narrative": prev_prd.strategic_narrative,
                "user_stories": [s.model_dump() for s in prev_prd.user_stories],
                "defensive_edge_cases": prev_prd.defensive_edge_cases,
                "telemetry_events": [e.model_dump() for e in prev_prd.telemetry_events],
                "rollout_plan": prev_prd.rollout_plan,
            }
            if prev_prd is not None
            else None
        )
        user_payload = {
            "project_name": payload.project_name or "CollabSense Workspace",
            "okr_focus": payload.okr_focus,
            "instruction": payload.instruction,
            "recent_history": [t.model_dump() for t in payload.history[-6:]],
            "cluster": {
                "cluster_id": cluster.cluster_id,
                "theme_title": cluster.theme_title,
                "severity": cluster.severity,
                "intent_category": cluster.intent_category,
                "product_area": cluster.product_area,
                "problem_summary": cluster.problem_summary,
                "root_cause": cluster.root_cause,
                "workaround_available": cluster.workaround_available,
                "ticket_ids": cluster.ticket_ids[:15],
                "representative_quotes": cluster.representative_quotes[:3],
                "computed_rice": cluster.computed_rice,
                "computed_wsjf": cluster.computed_wsjf,
            },
            "current_prd": current_spec_json,
        }
        token = last_ai_model_var.set(None)
        try:
            parsed = await call_openrouter_json(
                tier="cluster",
                system_prompt=PRD_CHAT_SYSTEM_PROMPT,
                user_prompt=json.dumps(user_payload),
                temperature=0.2,
                timeout_seconds=16.0,
                max_tokens=2200,
            )
            resolved_model = last_ai_model_var.get() or resolved_model
        finally:
            last_ai_model_var.reset(token)

        if parsed and isinstance(parsed.get("prd"), dict):
            coerced = _coerce_prd_schema(parsed["prd"], cluster=cluster, pm_notes="", base_prd=prev_prd)
            if coerced is not None:
                spec = coerced
                assistant_reply = str(parsed.get("assistant_reply") or "Updated the live PRD draft.").strip()
                raw_ch = parsed.get("changed_sections")
                if isinstance(raw_ch, list):
                    declared_changes = [str(c).strip() for c in raw_ch if str(c).strip()]

    if spec is None:
        spec, assistant_reply, declared_changes = _apply_deterministic_prd_instruction(
            prev_prd, cluster, payload.instruction
        )

    diff_changes = _compute_changed_sections(prev_prd, spec)
    changed_sections = diff_changes or declared_changes or ["executive_problem_statement"]
    md_body = render_prd_markdown(cluster=cluster, spec=spec)

    updated_prd = GeneratedPRD(
        prd_id=prev_prd.prd_id if prev_prd else f"PRD-{cluster.cluster_id}",
        cluster_id=cluster.cluster_id,
        title=spec.title,
        executive_problem_statement=spec.executive_problem_statement,
        target_persona=spec.target_persona,
        strategic_narrative=spec.strategic_narrative,
        deterministic_metrics_badge=(
            prev_prd.deterministic_metrics_badge
            if prev_prd
            else {
                "rice": cluster.computed_rice,
                "wsjf": cluster.computed_wsjf,
                "ice": cluster.computed_ice,
                "moscow": cluster.moscow_tag,
                "kano": cluster.kano_category,
                "reach": cluster.reach_count,
                "arr_impact": cluster.total_arr_impact,
            }
        ),
        user_stories=spec.user_stories,
        defensive_edge_cases=spec.defensive_edge_cases,
        telemetry_events=spec.telemetry_events,
        rollout_plan=spec.rollout_plan,
        markdown_body=md_body,
        engine_used=resolved_model,
    )
    elapsed_ms = round((time.perf_counter() - start_ts) * 1000.0, 2)
    return PRDChatResponse(
        assistant_reply=assistant_reply,
        changed_sections=changed_sections,
        updated_prd=updated_prd,
        model_used=resolved_model,
        latency_ms=elapsed_ms,
    )
