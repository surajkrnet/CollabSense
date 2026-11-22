from typing import Any, Dict, Optional
import httpx
from app.config import settings


def is_supabase_configured() -> bool:
    """Returns True when Supabase URL and Anon Key are configured."""
    return bool(settings.supabase_url and settings.supabase_anon_key)


async def check_supabase_rest_health() -> Dict[str, Any]:
    """Pings the Supabase PostgREST OpenAPI endpoint to verify live connectivity."""
    if not is_supabase_configured():
        return {
            "configured": False,
            "reachable": False,
            "project_url": None,
            "detail": "SUPABASE_URL or SUPABASE_ANON_KEY is not set.",
        }

    rest_url = f"{settings.supabase_url.rstrip('/')}/rest/v1/"
    headers = {
        "apikey": settings.supabase_anon_key,
        "Authorization": f"Bearer {settings.supabase_anon_key}",
    }
    try:
        async with httpx.AsyncClient(timeout=5.0) as client:
            resp = await client.get(rest_url, headers=headers)
            return {
                "configured": True,
                "reachable": resp.status_code in (200, 401),
                "status_code": resp.status_code,
                "project_url": settings.supabase_url,
            }
    except Exception as exc:
        return {
            "configured": True,
            "reachable": False,
            "project_url": settings.supabase_url,
            "detail": str(exc),
        }


async def insert_supabase_row(
    table: str,
    payload: Dict[str, Any],
    user_jwt: Optional[str] = None,
) -> Optional[Dict[str, Any]]:
    """
    Inserts a row into a Supabase table via PostgREST using the caller's JWT
    so Row-Level Security (`auth.uid() = user_id`) is strictly enforced.
    """
    if not is_supabase_configured() or not user_jwt:
        return None

    url = f"{settings.supabase_url.rstrip('/')}/rest/v1/{table}"
    headers = {
        "apikey": settings.supabase_anon_key,
        "Authorization": f"Bearer {user_jwt}",
        "Content-Type": "application/json",
        "Prefer": "return=representation",
    }
    try:
        async with httpx.AsyncClient(timeout=6.0) as client:
            resp = await client.post(url, json=payload, headers=headers)
            if resp.status_code in (200, 201):
                data = resp.json()
                return data[0] if isinstance(data, list) and data else data
    except Exception:
        return None
    return None
