# CollabSense — System Architecture & Engineering Specification

## 1. Executive Summary
**CollabSense** is an AI-native Product Strategy Operating System inspired by PostHog's philosophy of serving as *"your product's context layer"* with self-driving product loops. It ingests fragmented customer feedback across **Zendesk**, **Discord**, **Linear**, and **AppStore**, groups noisy complaints into root problem themes using Gemini Flash structured outputs, enforces deterministic multi-framework prioritization math (**RICE, WSJF, ICE, MoSCoW, Kano**), and synthesizes Gherkin-compliant PRDs ready for engineering handoff.

## 2. The Deterministic Math Boundary
Standard LLM wrappers fail in production Product Management workflows because LLMs hallucinate floating-point division and rank ordering. CollabSense eliminates arithmetic drift by enforcing a hard boundary:

| Layer | Responsibility | Technology |
| :--- | :--- | :--- |
| **Qualitative Layer** | Intent clustering, verbatim quote extraction, qualitative bounds (`Impact`, `Effort`, `Confidence`), Gherkin PRD prose | `google-genai` SDK (`gemini-2.5-flash` / `gemini-1.5-flash`) with Pydantic `response_schema` |
| **Quantitative Layer** | RICE, WSJF, ICE, MoSCoW threshold tagging, Kano sorting, LTV:CAC, Gross Margin, Inference Burn | Pure Python (`scorer_service.py`), PostgreSQL `GENERATED ALWAYS` columns, TypeScript (`calculators.ts`) |

## 3. API Specification (`/backend`)
- `GET /api/v1/sample-tickets`: Returns the 30-row realistic multi-channel B2B SaaS dataset (`Zendesk`, `Discord`, `Linear`, `AppStore`).
- `POST /api/v1/cluster` (alias `/api/triage/cluster`): Sanitizes raw tickets, executes Gemini semantic clustering, and attaches deterministic prioritization scores.
- `POST /api/v1/prioritize` (alias `/api/triage/score`): Recalculates RICE, WSJF, ICE, MoSCoW, and Kano rankings deterministically in `< 5ms`.
- `POST /api/v1/generate-prd` (alias `/api/prd/generate`): Synthesizes a structured PRD with Gherkin scenarios (`Given/When/Then`), defensive edge cases, and PostHog telemetry events.
- `POST /api/v1/unit-economics`: Computes SaaS + AI unit economics (LTV, CAC, LTV:CAC, Payback Months, Monthly LLM Inference Burn, Blended Gross Margin).
- `POST /api/v1/export-linear`: Exports an approved PRD cluster to Linear via GraphQL mutation (with offline dry-run support).
