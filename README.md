# 🦔 CollabSense — Autonomous Product Context, Triage & Spec OS

> **Eliminating "Spec Generation Lag" (4.5 hours $\rightarrow$ < 90 seconds) with PostHog-inspired retro-technical UX, Gemini structured outputs, and a strict Deterministic Math Boundary.**

---

## Architectural Highlights

1. **The Deterministic Math Boundary (`.agent/rules/architecture.md`)**:
   - **Qualitative AI Only**: Gemini (`gemini-2.5-flash` / `gemini-1.5-flash` via `google-genai` SDK + Pydantic v2 `response_schema`) performs semantic intent clustering, verbatim quote extraction, bounded qualitative parameter estimation, and Gherkin PRD synthesis.
   - **Zero Arithmetic Hallucinations**: All prioritization scores (**RICE, WSJF, ICE, MoSCoW, Kano**) and SaaS + AI unit economics (**LTV:CAC, Blended Gross Margin, Token Burn**) execute deterministically in pure Python (`backend/app/services/scorer_service.py`), PostgreSQL generated columns (`supabase/migrations/001_init_schema.sql`), and 60fps TypeScript (`frontend/src/lib/calculators.ts`).
2. **PostHog.com Retro-Technical Neo-Brutalist OS Aesthetic (`/frontend`)**:
   - Warm parchment dot-grid canvas (`#EEEFE9`), crisp cream window headers (`#FDFBF7`), `2px solid #18181B` ink borders, `3px 3px 0px #18181B` tactile offset drop shadows, `#FDF073` CTA yellow, `#F54E00` vermilion accents, and `IBM Plex Sans` + `JetBrains Mono` typography.
3. **Complete 3-Route & 6-Module Product Strategy OS**:
   - `/` — Editorial PostHog-style Landing Page with interactive triage preview & CLI snippet.
   - `/login` — Supabase Authentication gate (Email/Password + Google OAuth) + 1-click **"Enter as Demo PM"** portfolio bypass.
   - `/app` — Protected 6-Module Workspace:
     1. **Multi-Source Ingestion & Semantic Clustering** (30-row `Zendesk`, `Discord`, `Linear`, `AppStore` dataset + CSV upload)
     2. **Multi-Framework Prioritization Matrix** (RICE, WSJF, ICE, MoSCoW, Kano with 60fps live sliders)
     3. **HITL PRD & Gherkin Studio** (Side-by-side Gherkin inspector & editable Markdown + `.md` & Linear export)
     4. **Monetization & Unit Economics Simulator** (Interactive ARPU, CAC, Churn, and Gemini token burn modeling)
     5. **Growth Loops & Now/Next/Later Roadmapping** (PLG viral loops, AARRR funnel, and auto-hydrated Kanban roadmap)
     6. **GTM Strategy & AI Model Evals** (ICP wedge matrix & G-Eval benchmark harness across Gemini 2.5 Flash, 1.5 Flash, and GPT-4o-mini)

---

## Quick Start

### 1. Backend (`/backend`)
```bash
cd backend
pip install -r requirements.txt
pytest -v
uvicorn app.main:app --reload --port 8000
```

### 2. Frontend (`/frontend`)
```bash
cd frontend
npm install
npm run dev
```
