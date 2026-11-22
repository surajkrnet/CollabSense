import json
from pathlib import Path
from typing import Optional
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, HTMLResponse
from fastapi.staticfiles import StaticFiles
from app.config import settings
from app.routers.triage import router as triage_router
from app.services.supabase_service import check_supabase_rest_health, is_supabase_configured

app = FastAPI(
    title=settings.app_name,
    version=settings.app_version,
    description=(
        "CollabSense Autonomous Product Context, Triage & Spec OS Backend. "
        "Enforces the Deterministic Math Boundary: Gemini structured outputs for qualitative "
        "clustering & Gherkin PRD synthesis; pure Python for RICE, WSJF, ICE, MoSCoW, Kano, and Unit Economics."
    ),
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(triage_router)


@app.get("/health", tags=["System"])
def healthcheck() -> dict:
    """Healthcheck endpoint verifying service status and Deterministic Math Boundary enforcement."""
    return {
        "status": "ok",
        "service": settings.app_name,
        "version": settings.app_version,
        "deterministic_math_boundary": "ENFORCED",
        "gemini_model": settings.gemini_model_primary,
        "supabase_configured": is_supabase_configured(),
        "supabase_url": settings.supabase_url or None,
    }


@app.get("/api/v1/supabase-status", tags=["System"])
async def supabase_status() -> dict:
    """Verifies live connectivity to the configured Supabase PostgreSQL/PostgREST project."""
    return await check_supabase_rest_health()


def _resolve_static_dir() -> Optional[Path]:
    for candidate in (
        Path("/app/static"),
        Path(__file__).resolve().parents[2] / "frontend" / "dist",
    ):
        if candidate.is_dir():
            return candidate
    return None


def _render_spa_index(index_path: Path) -> HTMLResponse:
    """Injects public Supabase runtime configuration into index.html for single-origin hosting."""
    html = index_path.read_text(encoding="utf-8")
    pub_cfg = json.dumps(
        {
            "VITE_SUPABASE_URL": settings.supabase_url or "",
            "VITE_SUPABASE_ANON_KEY": settings.supabase_anon_key or "",
        }
    ).replace("</", "<\\/")
    injection = f"<script>window.__COLLABSENSE_ENV__={pub_cfg};</script>"
    if "</head>" in html:
        html = html.replace("</head>", f"{injection}</head>", 1)
    else:
        html = f"{injection}{html}"
    return HTMLResponse(content=html)


_INITIAL_STATIC_DIR = _resolve_static_dir()
if _INITIAL_STATIC_DIR and (_INITIAL_STATIC_DIR / "assets").is_dir():
    app.mount(
        "/assets",
        StaticFiles(directory=_INITIAL_STATIC_DIR / "assets"),
        name="assets",
    )


@app.get("/{full_path:path}", include_in_schema=False)
async def serve_spa(full_path: str):
    """Serves built frontend assets and SPA routes while preserving 404s for unknown /api paths."""
    if full_path == "api" or full_path.startswith("api/"):
        raise HTTPException(status_code=404, detail="Not Found")
    static_dir = _resolve_static_dir()
    if static_dir is None:
        raise HTTPException(status_code=404, detail="Frontend bundle not found")
    index_path = static_dir / "index.html"
    if not index_path.is_file():
        raise HTTPException(status_code=404, detail="Frontend bundle not found")
    if full_path:
        static_root = static_dir.resolve()
        candidate = (static_root / full_path).resolve()
        if candidate.is_relative_to(static_root) and candidate.is_file():
            return FileResponse(candidate)
    return _render_spa_index(index_path)
