"""
Unified Multi-Tier AI Client for CollabSense with Strict 8s Timeout Fallback & Per-Model Cooldowns:
- `heavy` tier (Home Co-Pilot, Stage 6 Initial PRD, Stage 8):
    1. `moonshotai/kimi-k3.1-pro` ONLY via NVIDIA NIM (hard 8.0s wall-clock cap -> immediate fallback)
    2. OpenRouter `nvidia/nemotron-3-ultra-550b-a55b:free` (~1.6s)
    3. NVIDIA NIM `nvidia/nemotron-3.5-super-vl-120b-a12b` (~0.5s)
    4. OpenRouter `nvidia/nemotron-3.5-super-vl:free` (~0.7s)
    5. NVIDIA NIM `nvidia/nemotron-3.5-lightning-30b-a3b` (~1.1s)
    6. OpenRouter `nvidia/nemotron-3.5-lightning:free` (~0.7s)
    7. Additional `:free` OpenRouter models (`google/gemma-4-31b-it:free`, `google/gemma-4-26b-a4b-it:free`, `inclusionai/ling-3.2-flash:free`)
- `cluster` tier (Stages 3 & 4 clustering + Stage 6 live PRD refinement):
    Prioritizes fastest high-reasoning models (`nemotron-3-ultra-550b-a55b:free` -> NIM 120B -> OR Super VL -> Kimi 8s -> Lightning).
- `light` tier (Stage 2 parallel noise chunks, Stage 3 Pass-2 classification, Stage 7 summary):
    Prioritizes sub-second 120B/Lightning models across NVIDIA NIM & OpenRouter `:free` models.

STRICT OPENROUTER GUARD: OpenRouter NEVER calls paid models (e.g., Kimi K3.1 Pro is blocked from OpenRouter).
"""

import asyncio
import contextvars
import json
import logging
import re
import time
from typing import Any, Dict, List, Literal, Optional, Set, Tuple
import httpx
from app.config import settings

logger = logging.getLogger("collabsense.ai")
if not logger.handlers:
    logging.basicConfig(level=logging.INFO)

ModelTier = Literal["light", "cluster", "heavy"]

# Async-safe provenance tracker recording the exact model that served the last call
last_ai_model_var: contextvars.ContextVar[Optional[str]] = contextvars.ContextVar(
    "collabsense_last_ai_model", default=None
)

# Per-model cooldown timestamps so HTTP 429 on one `:free` model never blocks healthy models
_model_cooldown_until: Dict[str, float] = {}


def get_allowed_openrouter_chat_models() -> Set[str]:
    return {
        settings.openrouter_ultra_model,
        settings.openrouter_super_model,
        settings.openrouter_light_model,
        settings.openrouter_gemma_large_model,
        settings.openrouter_gemma_fast_model,
        settings.openrouter_ling_flash_model,
    }


def get_allowed_openrouter_decider_models() -> Set[str]:
    return {settings.openrouter_decider_model}


def is_model_cooling_down(model: str) -> bool:
    return time.time() < _model_cooldown_until.get(model, 0.0)


def _trip_model_cooldown(model: str, seconds: float = 120.0, reason: str = "cooldown") -> None:
    _model_cooldown_until[model] = time.time() + seconds
    logger.warning("Model %s %s; cooling down for %.0fs", model, reason, seconds)


def is_openrouter_rate_limited() -> bool:
    """True only when ALL allowlisted OpenRouter `:free` chat models are cooling down."""
    models = get_allowed_openrouter_chat_models()
    return all(is_model_cooling_down(m) for m in models)


def _trip_openrouter_rate_limit(seconds: float = 120.0) -> None:
    for m in get_allowed_openrouter_chat_models():
        _trip_model_cooldown(m, seconds, reason="rate-limited")


def is_nvidia_kimi_cooling_down() -> bool:
    return is_model_cooling_down(settings.openrouter_strong_model)


def _trip_nvidia_kimi_cooldown(seconds: float = 180.0) -> None:
    _trip_model_cooldown(settings.openrouter_strong_model, seconds, reason="queue timeout (>8s)")


def is_nvidia_configured() -> bool:
    nv_key = (settings.nvidia_api_key or "").strip()
    return bool(nv_key) and not nv_key.startswith("your-") and not nv_key.startswith("your_")


def is_openrouter_key_present() -> bool:
    key = (settings.openrouter_api_key or "").strip()
    return bool(key) and not key.startswith("your-") and not key.startswith("your_")


def is_light_model_configured() -> bool:
    return is_nvidia_configured() or is_openrouter_key_present()


def is_heavy_model_configured() -> bool:
    return is_nvidia_configured() or is_openrouter_key_present()


def is_openrouter_configured() -> bool:
    return is_light_model_configured() or is_heavy_model_configured()


def get_model_for_tier(tier: ModelTier) -> str:
    if tier in ("light", "cluster"):
        return settings.nvidia_super_model if is_nvidia_configured() else settings.openrouter_super_model
    return settings.openrouter_strong_model


def _strip_think_blocks(raw_text: str) -> str:
    return re.sub(r"<think>[\s\S]*?</think>", "", raw_text, flags=re.IGNORECASE).strip()


def _extract_json_object(raw_text: str) -> Optional[Dict[str, Any]]:
    """Parses strict JSON or extracts JSON from markdown code fences cleanly."""
    if not raw_text:
        return None
    cleaned = _strip_think_blocks(raw_text)
    fence_match = re.search(r"```(?:json)?\s*([\s\S]*?)```", cleaned, re.IGNORECASE)
    if fence_match:
        cleaned = fence_match.group(1).strip()

    try:
        parsed = json.loads(cleaned)
        return parsed if isinstance(parsed, dict) else None
    except json.JSONDecodeError:
        start = cleaned.find("{")
        end = cleaned.rfind("}")
        if start != -1 and end != -1 and end > start:
            try:
                parsed = json.loads(cleaned[start : end + 1])
                return parsed if isinstance(parsed, dict) else None
            except json.JSONDecodeError:
                return None
    return None


async def _collect_sse_content(
    client: httpx.AsyncClient,
    url: str,
    headers: Dict[str, str],
    payload: Dict[str, Any],
) -> str:
    """Streams SSE chunks from NVIDIA NIM and joins assistant delta.content."""
    chunks: list[str] = []
    async with client.stream("POST", url, headers=headers, json=payload) as resp:
        if resp.status_code != 200:
            err_body = (await resp.aread()).decode("utf-8", errors="ignore")[:300]
            logger.warning("NVIDIA NIM stream HTTP %s for %s: %s", resp.status_code, payload.get("model"), err_body)
            return ""
        async for line in resp.aiter_lines():
            if not line:
                continue
            stripped = line.strip()
            if not stripped.startswith("data:"):
                continue
            data_str = stripped[5:].strip()
            if data_str == "[DONE]":
                break
            try:
                obj = json.loads(data_str)
            except json.JSONDecodeError:
                continue
            choices = obj.get("choices") or []
            if not choices:
                continue
            delta = choices[0].get("delta") or {}
            piece = delta.get("content")
            if isinstance(piece, str) and piece:
                chunks.append(piece)
    return "".join(chunks)


async def _call_nvidia_nim_chat(
    *,
    model: str,
    system_prompt: str,
    user_prompt: str,
    temperature: float = 0.15,
    timeout_seconds: float = 12.0,
    max_tokens: int = 4096,
    stream: bool = True,
    reasoning_effort: Optional[str] = "low",
) -> Optional[str]:
    if not is_nvidia_configured() or is_model_cooling_down(model):
        return None
    url = f"{settings.nvidia_base_url.rstrip('/')}/chat/completions"
    headers = {
        "Authorization": f"Bearer {settings.nvidia_api_key.strip()}",
        "Accept": "text/event-stream" if stream else "application/json",
        "Content-Type": "application/json",
    }
    resolved_max_tokens = (
        max(max_tokens, 3072)
        if ("kimi" in model.lower() or "nemotron" in model.lower())
        else max_tokens
    )
    payload: Dict[str, Any] = {
        "model": model,
        "messages": [
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": user_prompt},
        ],
        "max_tokens": resolved_max_tokens,
        "temperature": temperature,
        "stream": stream,
    }
    if "kimi" in model.lower():
        payload["seed"] = 0
        if reasoning_effort:
            payload["reasoning_effort"] = reasoning_effort
    elif "nemotron" in model.lower():
        payload["chat_template_kwargs"] = {"enable_thinking": False}

    t0 = time.perf_counter()
    timeout_cfg = httpx.Timeout(
        connect=min(5.0, timeout_seconds),
        read=timeout_seconds,
        write=min(10.0, timeout_seconds),
        pool=min(5.0, timeout_seconds),
    )

    async def _do_request() -> Optional[str]:
        async with httpx.AsyncClient(timeout=timeout_cfg) as client:
            if stream:
                content = await _collect_sse_content(client, url, headers, payload)
            else:
                resp = await client.post(url, headers=headers, json=payload)
                if resp.status_code == 429:
                    _trip_model_cooldown(model, 90.0, reason="HTTP 429")
                    return None
                if resp.status_code != 200:
                    logger.warning("NVIDIA NIM HTTP %s for %s: %s", resp.status_code, model, resp.text[:300])
                    return None
                data = resp.json()
                choices = data.get("choices") or []
                content = ((choices[0].get("message") or {}).get("content") or "") if choices else ""
            return content or None

    try:
        # Strict wall-clock guard so stalled streams (e.g. Kimi queue) ALWAYS trip fallback within timeout_seconds
        content = await asyncio.wait_for(_do_request(), timeout=timeout_seconds)
        elapsed = time.perf_counter() - t0
        if content:
            logger.info("NVIDIA NIM %s succeeded in %.2fs (%d chars)", model, elapsed, len(content))
            return content
        logger.warning("NVIDIA NIM %s returned empty content after %.2fs", model, elapsed)
        return None
    except (asyncio.TimeoutError, httpx.TimeoutException) as exc:
        elapsed = time.perf_counter() - t0
        logger.warning("NVIDIA NIM %s timed out after %.2fs: %s", model, elapsed, repr(exc))
        if "kimi" in model.lower():
            _trip_nvidia_kimi_cooldown(180.0)
        else:
            _trip_model_cooldown(model, 60.0, reason="timeout")
        return None
    except Exception as exc:
        logger.warning("NVIDIA NIM %s failed after %.2fs: %s", model, time.perf_counter() - t0, repr(exc))
        return None


async def _call_openrouter_chat(
    *,
    model: str,
    system_prompt: str,
    user_prompt: str,
    temperature: float = 0.15,
    timeout_seconds: float = 14.0,
    max_tokens: int = 2048,
) -> Optional[str]:
    if model not in get_allowed_openrouter_chat_models():
        logger.error("Blocked non-allowlisted OpenRouter chat model: %s", model)
        return None
    if not is_openrouter_key_present() or is_model_cooling_down(model):
        return None
    url = f"{settings.openrouter_base_url.rstrip('/')}/chat/completions"
    headers = {
        "Authorization": f"Bearer {settings.openrouter_api_key.strip()}",
        "Content-Type": "application/json",
        "HTTP-Referer": "https://collabsense.vercel.app",
        "X-Title": "CollabSense Product Discovery OS",
    }
    payload: Dict[str, Any] = {
        "model": model,
        "messages": [
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": user_prompt},
        ],
        "max_tokens": max(max_tokens, 2048),
        "temperature": temperature,
        "stream": False,
    }
    # Reasoning opt-out is valid on Nemotron/Ling models; avoid sending unknown parameter to Gemma
    if "nemotron" in model.lower() or "ling" in model.lower():
        payload["reasoning"] = {"enabled": False}

    t0 = time.perf_counter()
    timeout_cfg = httpx.Timeout(
        connect=min(4.0, timeout_seconds),
        read=timeout_seconds,
        write=min(6.0, timeout_seconds),
        pool=min(4.0, timeout_seconds),
    )

    async def _do_request() -> Optional[str]:
        async with httpx.AsyncClient(timeout=timeout_cfg) as client:
            resp = await client.post(url, headers=headers, json=payload)
            if resp.status_code == 429:
                _trip_model_cooldown(model, 120.0, reason="HTTP 429")
                return None
            if resp.status_code in (400, 404, 503):
                logger.warning("OpenRouter HTTP %s for %s: %s", resp.status_code, model, resp.text[:240])
                _trip_model_cooldown(model, 120.0, reason=f"HTTP {resp.status_code}")
                return None
            if resp.status_code != 200:
                logger.warning("OpenRouter HTTP %s for %s: %s", resp.status_code, model, resp.text[:300])
                return None
            data = resp.json()
            choices = data.get("choices") or []
            if not choices:
                return None
            content = (choices[0].get("message") or {}).get("content") or ""
            elapsed_inner = time.perf_counter() - t0
            if content:
                logger.info("OpenRouter %s succeeded in %.2fs (%d chars)", model, elapsed_inner, len(content))
            else:
                logger.warning(
                    "OpenRouter %s returned empty content (finish_reason=%s)",
                    model,
                    choices[0].get("finish_reason"),
                )
            return content

    try:
        return await asyncio.wait_for(_do_request(), timeout=timeout_seconds)
    except (asyncio.TimeoutError, httpx.TimeoutException) as exc:
        logger.warning(
            "OpenRouter %s timed out after %.2fs: %s",
            model,
            time.perf_counter() - t0,
            repr(exc),
        )
        _trip_model_cooldown(model, 90.0, reason="timeout")
        return None
    except Exception as exc:
        logger.warning("OpenRouter %s failed after %.2fs: %s", model, time.perf_counter() - t0, repr(exc))
        _trip_model_cooldown(model, 45.0, reason="timeout/network")
        return None


def _parse_or_wrap_text(
    raw_content: Optional[str],
    allow_text_fallback: bool,
) -> Optional[Dict[str, Any]]:
    if not raw_content:
        return None
    parsed = _extract_json_object(raw_content)
    if parsed is not None:
        return parsed
    if allow_text_fallback:
        cleaned = _strip_think_blocks(raw_content)
        if cleaned:
            cited = list(dict.fromkeys(re.findall(r"\b[A-Z]{2,6}-\d+\b", cleaned)))
            return {"reply": cleaned, "citations": cited, "_raw_text": True}
    return None


def _build_route_plan(tier: ModelTier) -> List[Tuple[str, str, float]]:
    """
    Returns ordered `(provider, model, timeout_seconds)` candidates tailored for accuracy & low latency.
    `provider` is `"nvidia"` or `"openrouter"`.
    """
    kimi_cap = max(3.0, min(float(settings.kimi_primary_timeout_seconds), 7.5))
    if tier == "heavy":
        return [
            ("nvidia", settings.openrouter_strong_model, kimi_cap),
            ("nvidia", settings.nvidia_super_model, 9.0),
            ("openrouter", settings.openrouter_super_model, 9.0),
            ("nvidia", settings.nvidia_light_model, 8.0),
            ("openrouter", settings.openrouter_light_model, 8.0),
            ("openrouter", settings.openrouter_ultra_model, 10.0),
            ("openrouter", settings.openrouter_gemma_large_model, 6.0),
            ("openrouter", settings.openrouter_gemma_fast_model, 6.0),
            ("openrouter", settings.openrouter_ling_flash_model, 6.0),
        ]
    if tier == "cluster":
        return [
            ("nvidia", settings.nvidia_super_model, 13.0),
            ("nvidia", settings.nvidia_light_model, 10.0),
            ("openrouter", settings.openrouter_light_model, 10.0),
            ("openrouter", settings.openrouter_super_model, 13.0),
            ("openrouter", settings.openrouter_ultra_model, 10.0),
            ("nvidia", settings.openrouter_strong_model, kimi_cap),
            ("openrouter", settings.openrouter_gemma_large_model, 6.0),
            ("openrouter", settings.openrouter_gemma_fast_model, 6.0),
            ("openrouter", settings.openrouter_ling_flash_model, 6.0),
        ]
    # tier == "light" — ultra-fast 0.5s–1.1s models first for multi-chunk batching
    return [
        ("nvidia", settings.nvidia_super_model, 10.0),
        ("nvidia", settings.nvidia_light_model, 9.0),
        ("openrouter", settings.openrouter_light_model, 9.0),
        ("openrouter", settings.openrouter_super_model, 10.0),
        ("openrouter", settings.openrouter_ultra_model, 10.0),
        ("openrouter", settings.openrouter_gemma_fast_model, 6.0),
        ("openrouter", settings.openrouter_gemma_large_model, 6.0),
        ("openrouter", settings.openrouter_ling_flash_model, 6.0),
    ]


async def call_ai_json_with_meta(
    *,
    tier: ModelTier,
    system_prompt: str,
    user_prompt: str,
    temperature: float = 0.15,
    timeout_seconds: float = 30.0,
    max_tokens: int = 4096,
    allow_text_fallback: bool = False,
) -> Tuple[Optional[Dict[str, Any]], str]:
    """
    Executes AI JSON synthesis across NVIDIA NIM & OpenRouter `:free` models
    with strict <8s Kimi fallback, per-model 429 cooldowns, and an overall wall-clock budget.
    """
    budget_floor = 18.0 if tier == "heavy" else (20.0 if tier == "cluster" else 16.0)
    deadline = time.perf_counter() + max(timeout_seconds, budget_floor)
    candidates = _build_route_plan(tier)
    for provider, model, default_step_timeout in candidates:
        remaining = deadline - time.perf_counter()
        if remaining < 2.0:
            logger.warning("Aborting fallback chain for tier=%s; remaining wall-clock budget %.2fs", tier, remaining)
            break
        step_timeout = min(default_step_timeout, max(timeout_seconds, 4.0), remaining)
        if provider == "nvidia":
            if not is_nvidia_configured() or is_model_cooling_down(model):
                continue
            is_kimi = "kimi" in model.lower()
            raw = await _call_nvidia_nim_chat(
                model=model,
                system_prompt=system_prompt,
                user_prompt=user_prompt,
                temperature=temperature,
                timeout_seconds=min(step_timeout, settings.kimi_primary_timeout_seconds) if is_kimi else step_timeout,
                max_tokens=max_tokens,
                stream=is_kimi,
                reasoning_effort="low" if is_kimi else None,
            )
        else:
            if not is_openrouter_key_present() or is_model_cooling_down(model):
                continue
            raw = await _call_openrouter_chat(
                model=model,
                system_prompt=system_prompt,
                user_prompt=user_prompt,
                temperature=temperature,
                timeout_seconds=step_timeout,
                max_tokens=max_tokens,
            )

        parsed = _parse_or_wrap_text(raw, allow_text_fallback)
        if parsed is not None:
            last_ai_model_var.set(model)
            return parsed, model

    default_model = get_model_for_tier(tier)
    last_ai_model_var.set(None)
    return None, default_model


async def call_openrouter_json(
    *,
    tier: ModelTier,
    system_prompt: str,
    user_prompt: str,
    temperature: float = 0.15,
    timeout_seconds: float = 30.0,
    max_tokens: int = 4096,
    allow_text_fallback: bool = False,
) -> Optional[Dict[str, Any]]:
    """Backward-compatible wrapper returning parsed JSON dict (used by services & unit tests)."""
    parsed, _ = await call_ai_json_with_meta(
        tier=tier,
        system_prompt=system_prompt,
        user_prompt=user_prompt,
        temperature=temperature,
        timeout_seconds=timeout_seconds,
        max_tokens=max_tokens,
        allow_text_fallback=allow_text_fallback,
    )
    return parsed


async def call_decider_model(
    *,
    state: list,
    questions: Dict[str, Any],
    timeout_seconds: float = 8.0,
) -> Optional[Dict[str, Any]]:
    """
    Calls Perplexity Decider V1.3 (free) via OpenRouter's Alpha Decisions API.
    Respects per-model cooldowns so callers never stall on exhausted quota.
    """
    model = settings.openrouter_decider_model
    if model not in get_allowed_openrouter_decider_models():
        logger.error("Blocked non-allowlisted OpenRouter decider model: %s", model)
        return None
    if not is_openrouter_key_present() or is_model_cooling_down(model):
        return None

    url = settings.openrouter_decisions_url.strip()
    headers = {
        "Authorization": f"Bearer {settings.openrouter_api_key.strip()}",
        "Content-Type": "application/json",
        "HTTP-Referer": "https://collabsense.vercel.app",
        "X-Title": "CollabSense Product Discovery OS",
    }
    payload: Dict[str, Any] = {
        "model": model,
        "state": state,
        "questions": questions,
    }
    try:
        async with httpx.AsyncClient(timeout=timeout_seconds) as client:
            resp = await client.post(url, headers=headers, json=payload)
            if resp.status_code == 429:
                _trip_model_cooldown(model, 120.0, reason="HTTP 429")
                return None
            if resp.status_code != 200:
                logger.warning("OpenRouter Decider HTTP %s: %s", resp.status_code, resp.text[:300])
                return None
            data = resp.json()
            answers = data.get("answers")
            return answers if isinstance(answers, dict) else None
    except Exception as exc:
        logger.warning("OpenRouter Decider failed: %s", repr(exc))
        _trip_model_cooldown(model, 60.0, reason="timeout/network")
        return None
