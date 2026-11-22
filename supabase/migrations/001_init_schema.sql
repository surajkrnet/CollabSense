-- =============================================================================
-- CollabSense: Autonomous Product Context, Triage & Spec OS
-- Migration: 001_init_schema.sql
-- Database: Supabase PostgreSQL 15+ with pgvector & Row-Level Security (RLS)
-- Enforces the Deterministic Math Boundary via PostgreSQL GENERATED ALWAYS columns
-- =============================================================================

CREATE EXTENSION IF NOT EXISTS "pgcrypto" WITH SCHEMA extensions;
CREATE EXTENSION IF NOT EXISTS "vector" WITH SCHEMA extensions;
SET search_path TO public, extensions;

-- -----------------------------------------------------------------------------
-- 1. PROFILES TABLE
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.profiles (
    id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    email TEXT NOT NULL,
    full_name TEXT,
    role TEXT NOT NULL DEFAULT 'Product Manager',
    organization TEXT DEFAULT 'CollabSense Workspace',
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- -----------------------------------------------------------------------------
-- 2. FEEDBACK BATCHES TABLE
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.feedback_batches (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    batch_name TEXT NOT NULL DEFAULT 'Multi-Channel Triage Batch',
    sources JSONB NOT NULL DEFAULT '["Zendesk", "Discord", "Linear", "AppStore"]'::jsonb,
    ticket_count INT NOT NULL DEFAULT 0,
    status TEXT NOT NULL DEFAULT 'CLUSTERED' CHECK (status IN ('INGESTED', 'CLUSTERING', 'CLUSTERED', 'ARCHIVED')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- -----------------------------------------------------------------------------
-- 3. RAW TICKETS TABLE
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.raw_tickets (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    batch_id UUID REFERENCES public.feedback_batches(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    ticket_code TEXT NOT NULL, -- e.g. TCK-101
    source TEXT NOT NULL CHECK (source IN ('Zendesk', 'Discord', 'Linear', 'AppStore', 'CSV')),
    customer_tier TEXT NOT NULL DEFAULT 'Standard' CHECK (customer_tier IN ('Enterprise', 'Mid-Market', 'Pro', 'Standard', 'Free')),
    arr_weight NUMERIC(10, 2) NOT NULL DEFAULT 12000.00,
    content TEXT NOT NULL,
    cluster_id UUID,
    embedding vector(768),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- -----------------------------------------------------------------------------
-- 4. CLUSTERS / PROBLEM CLUSTERS TABLE (Deterministic Math Boundary in SQL)
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.clusters (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    batch_id UUID REFERENCES public.feedback_batches(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    theme_title TEXT NOT NULL,
    problem_summary TEXT NOT NULL,
    severity TEXT NOT NULL DEFAULT 'P1' CHECK (severity IN ('P0', 'P1', 'P2', 'P3')),
    representative_quotes JSONB NOT NULL DEFAULT '[]'::jsonb,
    ticket_ids JSONB NOT NULL DEFAULT '[]'::jsonb,
    reach_count INT NOT NULL DEFAULT 1 CHECK (reach_count >= 0),
    impact_score NUMERIC(3, 1) NOT NULL DEFAULT 2.0 CHECK (impact_score >= 0.5 AND impact_score <= 3.0),
    confidence_score NUMERIC(3, 2) NOT NULL DEFAULT 0.80 CHECK (confidence_score >= 0.0 AND confidence_score <= 1.0),
    effort_score NUMERIC(3, 1) NOT NULL DEFAULT 2.0 CHECK (effort_score >= 0.5 AND effort_score <= 10.0),
    wsjf_cod INT NOT NULL DEFAULT 15 CHECK (wsjf_cod >= 1 AND wsjf_cod <= 50),
    wsjf_duration INT NOT NULL DEFAULT 2 CHECK (wsjf_duration >= 1 AND wsjf_duration <= 20),
    ice_ease NUMERIC(3, 1) NOT NULL DEFAULT 6.0 CHECK (ice_ease >= 1.0 AND ice_ease <= 10.0),
    moscow_tag TEXT NOT NULL DEFAULT 'SHOULD' CHECK (moscow_tag IN ('MUST', 'SHOULD', 'COULD', 'WONT')),
    kano_category TEXT NOT NULL DEFAULT 'Performance Feature',
    -- Deterministic SQL RICE & WSJF Generated Columns (Zero LLM Math Drift)
    computed_rice NUMERIC(8, 2) GENERATED ALWAYS AS (
        ROUND(((reach_count * impact_score * confidence_score) / NULLIF(effort_score, 0))::numeric, 2)
    ) STORED,
    computed_wsjf NUMERIC(8, 2) GENERATED ALWAYS AS (
        ROUND((wsjf_cod::numeric / NULLIF(wsjf_duration, 0)::numeric), 2)
    ) STORED,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Blueprint alias table/view compatibility for problem_clusters
CREATE OR REPLACE VIEW public.problem_clusters AS
SELECT * FROM public.clusters;

-- -----------------------------------------------------------------------------
-- 5. PRDS / GENERATED PRDS TABLE
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.prds (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    cluster_id UUID NOT NULL REFERENCES public.clusters(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    structured_json JSONB NOT NULL,
    markdown_body TEXT NOT NULL,
    gherkin_count INT NOT NULL DEFAULT 3,
    linear_issue_url TEXT,
    status TEXT NOT NULL DEFAULT 'DRAFT' CHECK (status IN ('DRAFT', 'HITL_APPROVED', 'EXPORTED')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Blueprint alias table/view compatibility for generated_prds
CREATE OR REPLACE VIEW public.generated_prds AS
SELECT * FROM public.prds;

-- -----------------------------------------------------------------------------
-- 6. INDEXES FOR SUB-SECOND QUERY LATENCY
-- -----------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_feedback_batches_user_id ON public.feedback_batches(user_id);
CREATE INDEX IF NOT EXISTS idx_raw_tickets_user_id ON public.raw_tickets(user_id);
CREATE INDEX IF NOT EXISTS idx_raw_tickets_batch_id ON public.raw_tickets(batch_id);
CREATE INDEX IF NOT EXISTS idx_clusters_user_id ON public.clusters(user_id);
CREATE INDEX IF NOT EXISTS idx_clusters_computed_rice ON public.clusters(computed_rice DESC);
CREATE INDEX IF NOT EXISTS idx_prds_cluster_id ON public.prds(cluster_id);
CREATE INDEX IF NOT EXISTS idx_prds_user_id ON public.prds(user_id);

-- -----------------------------------------------------------------------------
-- 7. ROW-LEVEL SECURITY (RLS) ENFORCEMENT & MULTI-TENANT POLICIES
-- -----------------------------------------------------------------------------
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.feedback_batches ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.raw_tickets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.clusters ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.prds ENABLE ROW LEVEL SECURITY;

-- Profiles Policies
DROP POLICY IF EXISTS "Users can view own profile" ON public.profiles;
CREATE POLICY "Users can view own profile"
    ON public.profiles FOR SELECT
    USING (auth.uid() = id);

DROP POLICY IF EXISTS "Users can insert own profile" ON public.profiles;
CREATE POLICY "Users can insert own profile"
    ON public.profiles FOR INSERT
    WITH CHECK (auth.uid() = id);

DROP POLICY IF EXISTS "Users can update own profile" ON public.profiles;
CREATE POLICY "Users can update own profile"
    ON public.profiles FOR UPDATE
    USING (auth.uid() = id)
    WITH CHECK (auth.uid() = id);

-- Feedback Batches Policies
DROP POLICY IF EXISTS "Users can select own feedback_batches" ON public.feedback_batches;
CREATE POLICY "Users can select own feedback_batches"
    ON public.feedback_batches FOR SELECT
    USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can insert own feedback_batches" ON public.feedback_batches;
CREATE POLICY "Users can insert own feedback_batches"
    ON public.feedback_batches FOR INSERT
    WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can update own feedback_batches" ON public.feedback_batches;
CREATE POLICY "Users can update own feedback_batches"
    ON public.feedback_batches FOR UPDATE
    USING (auth.uid() = user_id)
    WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can delete own feedback_batches" ON public.feedback_batches;
CREATE POLICY "Users can delete own feedback_batches"
    ON public.feedback_batches FOR DELETE
    USING (auth.uid() = user_id);

-- Raw Tickets Policies
DROP POLICY IF EXISTS "Users can select own raw_tickets" ON public.raw_tickets;
CREATE POLICY "Users can select own raw_tickets"
    ON public.raw_tickets FOR SELECT
    USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can insert own raw_tickets" ON public.raw_tickets;
CREATE POLICY "Users can insert own raw_tickets"
    ON public.raw_tickets FOR INSERT
    WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can update own raw_tickets" ON public.raw_tickets;
CREATE POLICY "Users can update own raw_tickets"
    ON public.raw_tickets FOR UPDATE
    USING (auth.uid() = user_id)
    WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can delete own raw_tickets" ON public.raw_tickets;
CREATE POLICY "Users can delete own raw_tickets"
    ON public.raw_tickets FOR DELETE
    USING (auth.uid() = user_id);

-- Clusters Policies
DROP POLICY IF EXISTS "Users can select own clusters" ON public.clusters;
CREATE POLICY "Users can select own clusters"
    ON public.clusters FOR SELECT
    USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can insert own clusters" ON public.clusters;
CREATE POLICY "Users can insert own clusters"
    ON public.clusters FOR INSERT
    WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can update own clusters" ON public.clusters;
CREATE POLICY "Users can update own clusters"
    ON public.clusters FOR UPDATE
    USING (auth.uid() = user_id)
    WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can delete own clusters" ON public.clusters;
CREATE POLICY "Users can delete own clusters"
    ON public.clusters FOR DELETE
    USING (auth.uid() = user_id);

-- PRDs Policies
DROP POLICY IF EXISTS "Users can select own prds" ON public.prds;
CREATE POLICY "Users can select own prds"
    ON public.prds FOR SELECT
    USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can insert own prds" ON public.prds;
CREATE POLICY "Users can insert own prds"
    ON public.prds FOR INSERT
    WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can update own prds" ON public.prds;
CREATE POLICY "Users can update own prds"
    ON public.prds FOR UPDATE
    USING (auth.uid() = user_id)
    WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can delete own prds" ON public.prds;
CREATE POLICY "Users can delete own prds"
    ON public.prds FOR DELETE
    USING (auth.uid() = user_id);
