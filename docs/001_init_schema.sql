-- =============================================================================
-- CollabSense: Autonomous Product Context, Triage & Spec OS
-- Migration Mirror in /docs: 001_init_schema.sql
-- =============================================================================
-- See supabase/migrations/001_init_schema.sql for the canonical migration.

CREATE EXTENSION IF NOT EXISTS "pgcrypto" WITH SCHEMA extensions;
CREATE EXTENSION IF NOT EXISTS "vector" WITH SCHEMA extensions;
SET search_path TO public, extensions;

CREATE TABLE IF NOT EXISTS public.profiles (
    id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    email TEXT NOT NULL,
    full_name TEXT,
    role TEXT NOT NULL DEFAULT 'Product Manager',
    organization TEXT DEFAULT 'CollabSense Workspace',
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.feedback_batches (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    batch_name TEXT NOT NULL DEFAULT 'Multi-Channel Triage Batch',
    sources JSONB NOT NULL DEFAULT '["Zendesk", "Discord", "Linear", "AppStore"]'::jsonb,
    ticket_count INT NOT NULL DEFAULT 0,
    status TEXT NOT NULL DEFAULT 'CLUSTERED',
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.raw_tickets (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    batch_id UUID REFERENCES public.feedback_batches(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    ticket_code TEXT NOT NULL,
    source TEXT NOT NULL,
    customer_tier TEXT NOT NULL DEFAULT 'Standard',
    arr_weight NUMERIC(10, 2) NOT NULL DEFAULT 12000.00,
    content TEXT NOT NULL,
    cluster_id UUID,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.clusters (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    batch_id UUID REFERENCES public.feedback_batches(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    theme_title TEXT NOT NULL,
    problem_summary TEXT NOT NULL,
    severity TEXT NOT NULL DEFAULT 'P1',
    representative_quotes JSONB NOT NULL DEFAULT '[]'::jsonb,
    ticket_ids JSONB NOT NULL DEFAULT '[]'::jsonb,
    reach_count INT NOT NULL DEFAULT 1,
    impact_score NUMERIC(3, 1) NOT NULL DEFAULT 2.0,
    confidence_score NUMERIC(3, 2) NOT NULL DEFAULT 0.80,
    effort_score NUMERIC(3, 1) NOT NULL DEFAULT 2.0,
    wsjf_cod INT NOT NULL DEFAULT 15,
    wsjf_duration INT NOT NULL DEFAULT 2,
    ice_ease NUMERIC(3, 1) NOT NULL DEFAULT 6.0,
    moscow_tag TEXT NOT NULL DEFAULT 'SHOULD',
    kano_category TEXT NOT NULL DEFAULT 'Performance Feature',
    computed_rice NUMERIC(8, 2) GENERATED ALWAYS AS (
        ROUND(((reach_count * impact_score * confidence_score) / NULLIF(effort_score, 0))::numeric, 2)
    ) STORED,
    computed_wsjf NUMERIC(8, 2) GENERATED ALWAYS AS (
        ROUND((wsjf_cod::numeric / NULLIF(wsjf_duration, 0)::numeric), 2)
    ) STORED,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE OR REPLACE VIEW public.problem_clusters AS SELECT * FROM public.clusters;

CREATE TABLE IF NOT EXISTS public.prds (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    cluster_id UUID NOT NULL REFERENCES public.clusters(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    structured_json JSONB NOT NULL,
    markdown_body TEXT NOT NULL,
    gherkin_count INT NOT NULL DEFAULT 3,
    linear_issue_url TEXT,
    status TEXT NOT NULL DEFAULT 'DRAFT',
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE OR REPLACE VIEW public.generated_prds AS SELECT * FROM public.prds;

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.feedback_batches ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.raw_tickets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.clusters ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.prds ENABLE ROW LEVEL SECURITY;
