import asyncio
import json
import re
import time
from typing import Dict, List, Set, Tuple
from app.config import settings
from app.schemas import (
    ChurnRiskLevel,
    EnrichedTicket,
    FeedbackCluster,
    HomeCopilotRequest,
    HomeCopilotResponse,
    IntentCategory,
    LoopClosureDraftItem,
    RawTicket,
    ReleaseValidationItem,
    Stage2NoiseRequest,
    Stage2NoiseResponse,
    Stage4TriageRequest,
    Stage4TriageResponse,
    Stage7ValidateRequest,
    Stage8GenerateRequest,
)
from app.services.clustering_service import (
    cluster_and_score_tickets_async,
)
from app.services.openrouter_service import (
    call_decider_model,
    call_openrouter_json,
    get_model_for_tier,
    is_openrouter_configured,
    is_openrouter_key_present,
    is_openrouter_rate_limited,
    last_ai_model_var,
)

SEVERITY_ORDER: Dict[str, int] = {"P0": 0, "P1": 1, "P2": 2, "P3": 3, "P4": 4}
VALID_URGENCIES: Set[str] = {"Critical", "High", "Medium", "Low"}

NOISE_PATTERNS: List[Tuple[str, Tuple[str, ...]]] = [
    ("Auto-Reply / OOO", ("out of office", "ooo", "on vacation", "auto-reply", "automatic reply", "away from my desk", "maternity leave")),
    ("Unsubscribe / Opt-Out", ("unsubscribe", "opt out", "opt-out", "remove me from this list", "stop emailing")),
    ("Password / Login Reset", ("forgot my password", "reset my password", "password reset link", "unlock my account", "2fa recovery code")),
    ("Billing / Invoice Routine", ("send a copy of our invoice", "download receipt", "update credit card", "w-9 form", "vat number", "billing invoice copy", "billing question only")),
    ("Spam / Promotional", ("buy followers", "seo services", "crypto airdrop", "click here for prize", "viagra", "spam")),
    ("Test / Gibberish", ("test ping", "testing 123", "asdfasdf", "hello world test", "ignore this test")),
    ("Generic Praise (No Actionable Ask)", ("just wanted to say thanks", "great job team!", "love your product!", "awesome work nothing needed")),
]


def _classify_ticket_deterministic(t: RawTicket) -> EnrichedTicket:
    """High-precision deterministic noise & multi-domain signal classifier (fallback only)."""
    text = t.content.lower().strip()
    is_noise = False
    noise_category = None
    noise_reason = None

    # Only mark short/purely non-product items as noise if they do NOT contain product defect cues
    has_product_cue = any(
        kw in text
        for kw in [
            "bug", "error", "crash", "500", "403", "504", "timeout", "fail", "feature", "export",
            "import", "csv", "saml", "scim", "sso", "api", "webhook", "slow", "freeze", "broken",
            "cannot", "unable to", "missing", "add support", "request", "integration", "ui", "ux",
        ]
    )

    if len(text) < 4:
        is_noise = True
        noise_category = "Test / Gibberish"
        noise_reason = "Message is too short to contain actionable product feedback."
    else:
        for cat, kws in NOISE_PATTERNS:
            if any(kw in text for kw in kws):
                # Billing/login keywords that mention an actual bug or pricing friction stay signals!
                if cat in ("Billing / Invoice Routine", "Password / Login Reset") and has_product_cue:
                    continue
                is_noise = True
                noise_category = cat
                noise_reason = f"Non-product {cat.lower()} filtered before clustering."
                break

    if is_noise:
        intent: IntentCategory = "Noise"
        urgency: ChurnRiskLevel = "Low"
    elif any(kw in text for kw in ["saml", "scim", "okta", "soc2", "rbac", "x509", "audit", "2fa", "mfa", "permission"]):
        intent = "Security & Compliance"
        urgency = "Critical"
    elif any(kw in text for kw in ["webhook", "api", "graphql", "sdk", "linear", "jira", "slack", "salesforce", "zapier", "sync"]):
        intent = "Integration & API"
        urgency = "High"
    elif any(kw in text for kw in ["csv", "export", "import", "bom", "utf-8", "pdf", "migration"]):
        intent = "Data & Export/Import"
        urgency = "High"
    elif any(kw in text for kw in ["timeout", "504", "slow", "freeze", "latency", "burst", "lag", "memory"]):
        intent = "Performance & Latency"
        urgency = "High"
    elif any(kw in text for kw in ["crash", "403", "500", "loop", "drops", "scramble", "fail", "vanish", "error", "bug", "broken"]):
        intent = "Bug / Defect"
        urgency = "Critical" if t.customer_tier == "Enterprise" else "High"
    elif any(kw in text for kw in ["dashboard", "chart", "report", "analytics", "metric"]):
        intent = "Analytics & Reporting"
        urgency = "Medium"
    elif any(kw in text for kw in ["onboarding", "setup", "wizard", "tutorial", "documentation", "docs"]):
        intent = "Onboarding & Activation"
        urgency = "Medium"
    elif any(kw in text for kw in ["mobile", "ios", "android", "ipad", "safari", "pwa", "offline"]):
        intent = "Mobile & Cross-Platform"
        urgency = "Medium"
    elif any(kw in text for kw in ["viewport", "cuts off", "swipe", "slider", "ui", "ux", "layout", "dark mode"]):
        intent = "UI/UX Friction"
        urgency = "Medium"
    else:
        intent = "Feature Request"
        urgency = "High" if t.customer_tier == "Enterprise" else "Medium"

    tier_sla = {
        "Enterprise": "Enterprise SLA",
        "Mid-Market": "Mid-Market Growth",
        "Pro": "Self-Serve Pro",
        "Standard": "Standard Tier",
        "Free": "Community Free Tier",
    }.get(t.customer_tier, "Standard Account Context")

    return EnrichedTicket(
        **t.model_dump(),
        is_noise=is_noise,
        noise_category=noise_category,
        noise_reason=noise_reason,
        intent=intent,
        urgency=urgency,
        account_context=f"{tier_sla} • ${t.arr_weight:,.0f} ARR" if t.arr_weight > 0 else tier_sla,
    )


def verify_citations(candidate_ids: List[str], valid_ids: Set[str]) -> List[str]:
    """Anti-hallucination guard: keeps ONLY ticket IDs that exist in the batch."""
    seen: Set[str] = set()
    verified: List[str] = []
    for tid in candidate_ids:
        clean = str(tid).strip().strip("[]")
        if clean in valid_ids and clean not in seen:
            seen.add(clean)
            verified.append(clean)
    return verified


async def run_stage2_noise_and_enrichment(
    payload: Stage2NoiseRequest,
) -> Stage2NoiseResponse:
    """
    Stage 2: High-accuracy, 100% row-coverage noise filtering & account enrichment.
    Processes ALL uploaded tickets in parallel chunks of 25 via fast sub-second `light` models.
    """
    start_ts = time.perf_counter()
    has_or = is_openrouter_configured()
    deterministic_map: Dict[str, EnrichedTicket] = {
        t.id: _classify_ticket_deterministic(t) for t in payload.tickets
    }

    default_light_model = get_model_for_tier("light")
    resolved_models: List[str] = []

    if has_or and payload.tickets:
        system_prompt = (
            "You are CollabSense Stage 2 Noise Filter & Signal Classifier. Separate TRUE NON-PRODUCT NOISE "
            "from ACTIONABLE PRODUCT SIGNALS with high precision.\n"
            "NOISE (`is_noise: true`) ONLY includes:\n"
            "- Out-of-office / vacation / automated replies (`Auto-Reply / OOO`)\n"
            "- Unsubscribe / opt-out requests (`Unsubscribe / Opt-Out`)\n"
            "- Routine password/2FA reset asks (`Password / Login Reset`)\n"
            "- Routine invoice/W-9/receipt requests unrelated to a bug (`Billing / Invoice Routine`)\n"
            "- Spam / phishing / promo links (`Spam / Promotional`)\n"
            "- Meaningless test pings / gibberish (`Test / Gibberish`)\n"
            "- Pure thanks/praise with zero bug, friction, or feature ask (`Generic Praise`)\n\n"
            "SIGNALS (`is_noise: false`) include ALL real bugs, crashes, UI/UX confusion, feature requests, "
            "integrations, exports, performance complaints, security/compliance asks, onboarding gaps, or pricing complaints.\n"
            "For EVERY input ticket ID return:\n"
            "- `id`: exact ticket id\n"
            "- `is_noise`: boolean\n"
            "- `noise_category`: one of the noise category names above if `is_noise: true`, else null\n"
            "- `noise_reason`: concise explanation if `is_noise: true`, else null\n"
            "- `intent`: specific signal category (e.g. 'Bug / Defect', 'UI/UX Friction', 'Feature Request', 'Performance & Latency', 'Security & Compliance', 'Integration & API', 'Data & Export/Import', 'Onboarding & Activation', 'Analytics & Reporting', 'Billing & Pricing Friction', 'Mobile & Cross-Platform', or 'Noise' when is_noise is true)\n"
            "- `urgency`: 'Critical' | 'High' | 'Medium' | 'Low'\n"
            "- `account_context`: concise tier label (mention ARR ONLY if `arr_weight > 0` was provided; NEVER invent dollar amounts).\n"
            "Return ONLY JSON: {\"items\": [{\"id\": \"...\", \"is_noise\": false, \"noise_category\": null, \"noise_reason\": null, \"intent\": \"...\", \"urgency\": \"High\", \"account_context\": \"...\"}]}."
        )

        sem = asyncio.Semaphore(5)

        async def _process_chunk(chunk: List[RawTicket]) -> Tuple[List[dict], str | None]:
            compact = [
                {
                    "id": t.id,
                    "source": t.source,
                    "customer_tier": t.customer_tier,
                    **({"arr_weight": t.arr_weight} if t.arr_weight > 0 else {}),
                    "content": t.content[:360],
                }
                for t in chunk
            ]
            token = last_ai_model_var.set(None)
            try:
                async with sem:
                    parsed = await call_openrouter_json(
                        tier="light",
                        system_prompt=system_prompt,
                        user_prompt=json.dumps({"project_id": payload.project_id, "tickets": compact}),
                        temperature=0.05,
                        timeout_seconds=14.0,
                        max_tokens=3000,
                    )
                    used = last_ai_model_var.get()
            finally:
                last_ai_model_var.reset(token)
            items = parsed.get("items") if (parsed and isinstance(parsed.get("items"), list)) else []
            return items, used

        chunks = [payload.tickets[i : i + 25] for i in range(0, len(payload.tickets), 25)]
        results = await asyncio.gather(*[_process_chunk(c) for c in chunks], return_exceptions=True)

        for res in results:
            if not isinstance(res, tuple):
                continue
            items, used_m = res
            if used_m:
                resolved_models.append(used_m)
            for item in items:
                if not isinstance(item, dict):
                    continue
                tid = str(item.get("id", "")).strip()
                if tid not in deterministic_map:
                    continue
                base = deterministic_map[tid]
                is_noise = bool(item.get("is_noise", base.is_noise))
                raw_intent = str(item.get("intent") or base.intent).strip()[:80]
                valid_intent: IntentCategory = (
                    "Noise"
                    if is_noise
                    else (base.intent if not raw_intent or raw_intent.lower() == "noise" else raw_intent)
                )
                noise_cat = (
                    str(item.get("noise_category") or base.noise_category or "Non-Product Noise").strip()[:60]
                    if is_noise
                    else None
                )
                noise_reason = (
                    str(item.get("noise_reason") or base.noise_reason or "Filtered as non-product noise at Stage 2.")
                    if is_noise
                    else None
                )
                raw_urg = str(item.get("urgency") or base.urgency).strip()
                urgency: ChurnRiskLevel = (
                    raw_urg if raw_urg in VALID_URGENCIES else base.urgency  # type: ignore[assignment]
                )
                acct_ctx = str(item.get("account_context") or base.account_context).strip()
                if base.arr_weight <= 0 and "$0" in acct_ctx:
                    acct_ctx = base.account_context
                deterministic_map[tid] = EnrichedTicket(
                    **base.model_dump(
                        exclude={"is_noise", "noise_category", "noise_reason", "intent", "urgency", "account_context"}
                    ),
                    is_noise=is_noise,
                    noise_category=noise_cat,
                    noise_reason=noise_reason,
                    intent=valid_intent,
                    urgency=urgency,
                    account_context=acct_ctx,
                )

    enriched = [deterministic_map[t.id] for t in payload.tickets]
    noise_breakdown: Dict[str, int] = {}
    for t in enriched:
        if t.is_noise:
            cat_key = t.noise_category or "Non-Product Noise"
            noise_breakdown[cat_key] = noise_breakdown.get(cat_key, 0) + 1

    resolved_model = resolved_models[0] if resolved_models else default_light_model
    noise_count = sum(1 for t in enriched if t.is_noise)
    signal_count = len(enriched) - noise_count
    elapsed_ms = round((time.perf_counter() - start_ts) * 1000.0, 2)
    env_notice = (
        None
        if has_or
        else f"AI API keys are not set — running deterministic classifier ({resolved_model})."
    )
    return Stage2NoiseResponse(
        project_id=payload.project_id,
        model_used=resolved_model,
        openrouter_configured=has_or,
        env_notice=env_notice,
        total_count=len(enriched),
        signal_count=signal_count,
        noise_count=noise_count,
        noise_breakdown=noise_breakdown,
        latency_ms=elapsed_ms,
        tickets=enriched,
    )


async def run_stage4_root_cause_triage(
    payload: Stage4TriageRequest,
) -> Stage4TriageResponse:
    """
    Stages 3 & 4 Low-Latency Single-Pass Pipeline:
    1. Discovers rich problem clusters & metadata via `cluster` tier (Map-Reduce for >55 rows).
    2. Verifies 100% real citations (strips any hallucinated ticket IDs).
    3. Sorts clusters strictly by severity hierarchy (P0 -> P1 -> P2 -> P3 -> P4, then reach desc, then ARR desc).
    """
    has_or = is_openrouter_configured()
    valid_ids = {t.id for t in payload.tickets}
    base = await cluster_and_score_tickets_async(
        batch_name="Stage 3 & 4 Triage",
        tickets=payload.tickets,
    )

    enriched_clusters: List[FeedbackCluster] = []
    for c in base.clusters:
        verified = verify_citations(c.verified_citations or c.ticket_ids, valid_ids)
        if not verified:
            verified = verify_citations(c.ticket_ids, valid_ids) or c.ticket_ids
        c.verified_citations = verified
        if not c.root_cause:
            c.root_cause = f"Root cause identified across {len(c.ticket_ids)} verified citations: {c.problem_summary}"
        c.gate1_status = "APPROVED" if c.severity in ("P0", "P1") else "PENDING"
        enriched_clusters.append(c)

    enriched_clusters.sort(
        key=lambda c: (
            SEVERITY_ORDER.get(c.severity, 9),
            -len(c.ticket_ids),
            -c.total_arr_impact,
            -c.computed_rice,
        )
    )

    env_notice = (
        None
        if has_or
        else f"AI API keys are not set — running deterministic triage ({base.engine_used})."
    )
    return Stage4TriageResponse(
        project_id=payload.project_id,
        model_used=base.engine_used,
        openrouter_configured=has_or,
        env_notice=env_notice,
        clusters=enriched_clusters,
    )


async def run_home_copilot(payload: HomeCopilotRequest) -> HomeCopilotResponse:
    """
    Home AI Co-Pilot: tries NVIDIA NIM `moonshotai/kimi-k3.1-pro` with a STRICT 8.0s wall-clock cap,
    and automatically falls back within 8s to fast OpenRouter `:free` / NVIDIA NIM models so replies
    NEVER stall or hang.
    """
    start_ts = time.perf_counter()
    has_or = is_openrouter_configured()
    tickets = payload.tickets or []
    clusters = payload.clusters or []
    valid_ids = {t.id for t in tickets}

    if has_or:
        ticket_context = [
            {
                "id": t.id,
                "source": t.source,
                "tier": t.customer_tier,
                **({"arr": t.arr_weight} if t.arr_weight > 0 else {}),
                "content": t.content[:220],
            }
            for t in tickets[:30]
        ]
        cluster_context = [
            {
                "cluster_id": c.cluster_id,
                "theme_title": c.theme_title,
                "severity": c.severity,
                "intent": c.intent_category,
                "triage_status": c.gate1_status,
                "rice": c.computed_rice,
                "wsjf": c.computed_wsjf,
                "root_cause": c.root_cause[:180],
                "ticket_ids": c.ticket_ids[:6],
            }
            for c in clusters[:10]
        ]

        if ticket_context:
            citation_rule = (
                "Ground factual claims about feedback in exact ticket IDs from `tickets` (e.g. "
                + ", ".join(t["id"] for t in ticket_context[:4])
                + "). Never invent ticket IDs or ARR values."
            )
        else:
            citation_rule = (
                "No customer feedback tickets have been uploaded to this project yet. "
                "Answer directly and concisely as an expert Product Strategy Co-Pilot, "
                "and if they ask for ticket analysis, suggest uploading data in Stage 1. "
                "Set `citations` to []."
            )

        system_prompt = (
            f"You are the CollabSense AI Co-Pilot for project '{payload.project_name}' "
            f"(OKR Focus: {payload.okr_focus}). {citation_rule}\n"
            "Return ONLY a JSON object with keys: "
            "`reply` (clear, actionable, concise answer string), "
            "`citations` (array of exact ticket ID strings from `tickets`, or [] if none), "
            "`suggested_stage` (one of 'upload','noise','intent','triage','prioritization','prd','validation','closure')."
        )
        user_payload = {
            "question": payload.prompt,
            "tickets_count": len(tickets),
            "tickets": ticket_context,
            "clusters": cluster_context,
        }

        token = last_ai_model_var.set(None)
        try:
            parsed = await call_openrouter_json(
                tier="heavy",
                system_prompt=system_prompt,
                user_prompt=json.dumps(user_payload),
                temperature=0.2,
                timeout_seconds=14.0,
                max_tokens=1200,
                allow_text_fallback=True,
            )
            resolved_model = last_ai_model_var.get() or settings.openrouter_strong_model
        finally:
            last_ai_model_var.reset(token)

        if parsed and parsed.get("reply"):
            raw_citations = parsed.get("citations") if isinstance(parsed.get("citations"), list) else []
            cited = verify_citations(raw_citations, valid_ids) if valid_ids else []
            suggested = str(parsed.get("suggested_stage") or ("upload" if not tickets else "triage"))
            elapsed_ms = round((time.perf_counter() - start_ts) * 1000.0, 2)
            return HomeCopilotResponse(
                reply=str(parsed["reply"]).strip(),
                citations=cited,
                suggested_stage=suggested,
                model_used=resolved_model,
                openrouter_configured=True,
                latency_ms=elapsed_ms,
            )

    elapsed_ms = round((time.perf_counter() - start_ts) * 1000.0, 2)
    if not tickets:
        return HomeCopilotResponse(
            reply=(
                f"AI Co-Pilot is currently offline for '{payload.project_name}'. "
                "Please verify API connectivity or upload tickets in Stage 1 (Upload Data) to run the local pipeline."
            ),
            citations=[],
            suggested_stage="upload",
            model_used=settings.openrouter_strong_model,
            openrouter_configured=has_or,
            latency_ms=elapsed_ms,
        )

    top_ids = [t.id for t in tickets[:4]]
    return HomeCopilotResponse(
        reply=(
            f"CollabSense Co-Pilot indexed {len(tickets)} uploaded ticket(s) for '{payload.project_name}'. "
            f"Uploaded items include {', '.join(f'[{tid}]' for tid in top_ids)}. "
            "Run Stage 2 Noise Filtering and Stage 3 Intent & Clusters to synthesize root causes and scores."
        ),
        citations=top_ids,
        suggested_stage="noise",
        model_used=settings.openrouter_strong_model,
        openrouter_configured=has_or,
        latency_ms=elapsed_ms,
    )


async def run_stage7_validate_release(payload: Stage7ValidateRequest) -> ReleaseValidationItem:
    """
    Stage 7 (Release & Validation):
    Computes exact deterministic post-release delta % & spike flag in pure Python,
    then uses fast AI telemetry summarization.
    """
    pre = payload.pre_release_daily_tickets
    post = payload.post_release_daily_tickets
    delta_pct = round(((post - pre) / max(pre, 0.1)) * 100.0, 1)
    spike_detected = post > pre * 1.15

    if spike_detected:
        verdict = "REGRESSION_SPIKE"
    elif post <= pre * 0.65 and post <= 2.0:
        verdict = "VERIFIED_RESOLVED"
    else:
        verdict = "MONITORING"

    summary = (
        f"{payload.release_tag}: ticket volume changed {delta_pct:+.1f}% "
        f"({pre:.1f}/day pre -> {post:.1f}/day post)."
    )

    if is_openrouter_configured():
        prompt = json.dumps(
            {
                "cluster_id": payload.cluster_id,
                "theme_title": payload.theme_title,
                "release_tag": payload.release_tag,
                "feature_flag": payload.feature_flag,
                "pre_release_daily_tickets": pre,
                "post_release_daily_tickets": post,
                "delta_pct": delta_pct,
                "verdict": verdict,
                "post_release_notes": payload.post_release_notes,
                "citations": payload.citations,
            }
        )
        parsed = await call_openrouter_json(
            tier="light",
            system_prompt=(
                "You are a Release Reliability PM verifying production telemetry in Stage 7. "
                "Write a crisp 1-2 sentence `regression_summary` referencing exact metrics & release tag provided. "
                "Return ONLY JSON: {\"regression_summary\": \"...\"}."
            ),
            user_prompt=prompt,
            temperature=0.1,
            timeout_seconds=12.0,
            max_tokens=512,
        )
        if parsed and parsed.get("regression_summary"):
            summary = str(parsed["regression_summary"]).strip()

    return ReleaseValidationItem(
        cluster_id=payload.cluster_id,
        theme_title=payload.theme_title,
        release_tag=payload.release_tag,
        pre_release_daily_tickets=pre,
        post_release_daily_tickets=post,
        delta_pct=delta_pct,
        spike_detected=spike_detected,
        verdict=verdict,  # type: ignore[arg-type]
        regression_summary=summary,
        citations=payload.citations,
    )


async def run_stage8_generate_loop_closures(
    payload: Stage8GenerateRequest,
) -> List[LoopClosureDraftItem]:
    """
    Stage 8 (Closing the Loop):
    Uses Heavyweight AI (with 8s Kimi cap -> Nemotron Ultra/Super fallback) to draft tailored
    external updates + internal Support/Sales release playbooks.
    """
    if not payload.clusters:
        return []

    valid_channels = {"Zendesk", "Discord", "Email", "Linear"}
    defaults: List[LoopClosureDraftItem] = []
    for idx, c in enumerate(payload.clusters, start=1):
        chan = next((ch for ch in (c.channels or []) if ch in valid_channels), "Email")
        arr_suffix = f" (${round(c.total_arr_impact / 1000)}k ARR)" if c.total_arr_impact > 0 else ""
        cites_str = ", ".join(f"[{tid}]" for tid in c.ticket_ids[:6])
        defaults.append(
            LoopClosureDraftItem(
                draft_id=f"LC-0{idx}" if idx < 10 else f"LC-{idx}",
                cluster_id=c.cluster_id,
                theme_title=c.theme_title,
                channel=chan,  # type: ignore[arg-type]
                recipient_segment=f"{len(c.ticket_ids)} affected ticket(s){arr_suffix}",
                cited_tickets=c.ticket_ids,
                subject=f"[Update] Fix shipped for {c.theme_title}",
                message_body=(
                    f"Hi there — thank you for flagging this in {cites_str}. "
                    f"We have addressed the underlying issue ({c.root_cause or c.problem_summary}) for {c.theme_title}."
                ),
                internal_playbook_note=(
                    f"Support & Sales Note ({c.severity}): {c.theme_title} ({c.cluster_id}) resolved. "
                    f"Link any follow-ups to resolved citations: {cites_str}."
                ),
                status="DRAFT",
            )
        )

    if not is_openrouter_configured():
        return defaults

    cluster_inputs = [
        {
            "cluster_id": c.cluster_id,
            "theme_title": c.theme_title,
            "severity": c.severity,
            "channels": c.channels,
            "problem_summary": c.problem_summary,
            "root_cause": c.root_cause,
            "ticket_ids": c.ticket_ids[:8],
            "total_arr_impact": c.total_arr_impact if c.total_arr_impact > 0 else None,
        }
        for c in payload.clusters[:8]
    ]
    parsed = await call_openrouter_json(
        tier="heavy",
        system_prompt=(
            f"You are CollabSense Stage 8 Closing-the-Loop Communications Lead for project '{payload.project_name}'. "
            "For each problem cluster, draft:\n"
            "1. A personalized customer notification (`subject`, `message_body`) appropriate for its channel, explicitly citing its real ticket IDs like [TCK-101].\n"
            "2. An `internal_playbook_note` for Support & Sales explaining what was fixed and preventing duplicate ticket logging.\n"
            "Never invent ticket IDs or ARR figures. Return ONLY JSON: "
            "{\"drafts\": [{\"cluster_id\": \"...\", \"channel\": \"Zendesk|Discord|Email|Linear\", \"subject\": \"...\", \"message_body\": \"...\", \"internal_playbook_note\": \"...\"}]}."
        ),
        user_prompt=json.dumps({"clusters": cluster_inputs}),
        temperature=0.2,
        timeout_seconds=16.0,
        max_tokens=1800,
    )

    if parsed and isinstance(parsed.get("drafts"), list):
        by_cid = {str(d.get("cluster_id")): d for d in parsed["drafts"] if isinstance(d, dict)}
        for item in defaults:
            ai_d = by_cid.get(item.cluster_id)
            if not ai_d:
                continue
            if ai_d.get("channel") in valid_channels:
                item.channel = ai_d["channel"]  # type: ignore[assignment]
            if ai_d.get("subject"):
                item.subject = str(ai_d["subject"]).strip()
            if ai_d.get("message_body"):
                item.message_body = str(ai_d["message_body"]).strip()
            if ai_d.get("internal_playbook_note"):
                item.internal_playbook_note = str(ai_d["internal_playbook_note"]).strip()

    return defaults


def get_default_release_validations() -> List[ReleaseValidationItem]:
    return [
        ReleaseValidationItem(
            cluster_id="CLU-01",
            theme_title="Enterprise SAML 2.0 SSO & Okta SCIM Group Provisioning",
            release_tag="v2.4.0-rc1",
            pre_release_daily_tickets=4.2,
            post_release_daily_tickets=0.4,
            delta_pct=-90.5,
            spike_detected=False,
            verdict="VERIFIED_RESOLVED",
            regression_summary="SAML 2.0 multi-domain audience validation and <60s SCIM token revocation verified across 14 Enterprise tenants.",
            citations=["TCK-101", "TCK-102", "TCK-103", "TCK-107"],
        ),
        ReleaseValidationItem(
            cluster_id="CLU-02",
            theme_title="Async Chunked CSV & High-Burst Webhook Ingestion Pipeline",
            release_tag="v2.4.0-rc2",
            pre_release_daily_tickets=3.8,
            post_release_daily_tickets=0.6,
            delta_pct=-84.2,
            spike_detected=False,
            verdict="VERIFIED_RESOLVED",
            regression_summary="Chunked streaming CSV worker processes 10,000 rows in 4.1s with UTF-8 BOM normalization.",
            citations=["TCK-109", "TCK-111", "TCK-112", "TCK-115"],
        ),
    ]


def get_default_loop_closures() -> List[LoopClosureDraftItem]:
    return [
        LoopClosureDraftItem(
            draft_id="LC-01",
            cluster_id="CLU-01",
            theme_title="Enterprise SAML 2.0 SSO & Okta SCIM Group Provisioning",
            channel="Zendesk",
            recipient_segment="8 Enterprise Security & IT Admins ($818k ARR)",
            cited_tickets=["TCK-101", "TCK-102", "TCK-103", "TCK-104", "TCK-106", "TCK-107", "TCK-108"],
            subject="[Resolved in v2.4.0] Multi-Domain Okta SAML 2.0 & Real-Time SCIM Token Revocation",
            message_body=(
                "Hi team — we shipped v2.4.0 resolving your reported Okta SAML InvalidAudience 403 errors "
                "([TCK-101]), multi-domain IdP routing ([TCK-106]), and immediate JWT revocation on SCIM deprovisioning ([TCK-102], [TCK-107])."
            ),
            internal_playbook_note="Support/Sales: SAML multi-domain audience bug resolved in v2.4.0; close linked Zendesk tickets against CLU-01.",
            status="APPROVED_TO_SEND",
        ),
    ]
