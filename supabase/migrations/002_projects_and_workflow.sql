-- =============================================================================
-- CollabSense v4: Project-Scoped 8-Stage Product Strategy OS Schema
-- Migration: 002_projects_and_workflow.sql
-- Database: Supabase PostgreSQL 15+ with pgvector & Project-Scoped RLS
-- =============================================================================

CREATE EXTENSION IF NOT EXISTS "pgcrypto" WITH SCHEMA extensions;
CREATE EXTENSION IF NOT EXISTS "vector" WITH SCHEMA extensions;
SET search_path TO public, extensions;

-- -----------------------------------------------------------------------------
-- 1. PROJECTS & PROJECT MEMBERS (Multi-Project Isolation)
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.projects (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    owner_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    description TEXT NOT NULL DEFAULT '',
    okr_focus TEXT NOT NULL DEFAULT '',
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.project_members (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
    user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    invited_email TEXT NOT NULL,
    role TEXT NOT NULL DEFAULT 'editor' CHECK (role IN ('owner', 'editor', 'viewer')),
    status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'invited')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (project_id, invited_email)
);

-- Helper function for Project-Scoped RLS without infinite recursion
CREATE OR REPLACE FUNCTION public.is_project_member(p_project_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
    SELECT EXISTS (
        SELECT 1 FROM public.projects p
        WHERE p.id = p_project_id AND p.owner_id = auth.uid()
    )
    OR EXISTS (
        SELECT 1 FROM public.project_members pm
        WHERE pm.project_id = p_project_id AND pm.user_id = auth.uid()
    );
$$;

-- -----------------------------------------------------------------------------
-- 2. EXTEND EXISTING TABLES WITH PROJECT_ID & 8-STAGE WORKFLOW COLUMNS
-- -----------------------------------------------------------------------------
ALTER TABLE public.feedback_batches
    ADD COLUMN IF NOT EXISTS project_id UUID REFERENCES public.projects(id) ON DELETE CASCADE,
    ADD COLUMN IF NOT EXISTS noise_filtered_count INT NOT NULL DEFAULT 0;

ALTER TABLE public.raw_tickets
    ADD COLUMN IF NOT EXISTS project_id UUID REFERENCES public.projects(id) ON DELETE CASCADE,
    ADD COLUMN IF NOT EXISTS is_noise BOOLEAN NOT NULL DEFAULT FALSE,
    ADD COLUMN IF NOT EXISTS noise_reason TEXT,
    ADD COLUMN IF NOT EXISTS intent TEXT DEFAULT 'Unclassified' CHECK (
        intent IN ('Unclassified', 'Bug', 'UI/UX Friction', 'Feature Request', 'Performance', 'Security/Compliance', 'Noise')
    ),
    ADD COLUMN IF NOT EXISTS stage INT NOT NULL DEFAULT 1;

ALTER TABLE public.clusters
    ADD COLUMN IF NOT EXISTS project_id UUID REFERENCES public.projects(id) ON DELETE CASCADE,
    ADD COLUMN IF NOT EXISTS intent_category TEXT NOT NULL DEFAULT 'Bug',
    ADD COLUMN IF NOT EXISTS root_cause TEXT NOT NULL DEFAULT '',
    ADD COLUMN IF NOT EXISTS gate1_status TEXT NOT NULL DEFAULT 'PENDING' CHECK (
        gate1_status IN ('PENDING', 'APPROVED', 'REJECTED')
    ),
    ADD COLUMN IF NOT EXISTS gate1_notes TEXT,
    ADD COLUMN IF NOT EXISTS gate1_approved_by TEXT,
    ADD COLUMN IF NOT EXISTS gate1_approved_at TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS citations JSONB NOT NULL DEFAULT '[]'::jsonb,
    ADD COLUMN IF NOT EXISTS total_arr_impact NUMERIC(12, 2) NOT NULL DEFAULT 0;

ALTER TABLE public.prds
    ADD COLUMN IF NOT EXISTS project_id UUID REFERENCES public.projects(id) ON DELETE CASCADE,
    ADD COLUMN IF NOT EXISTS citations JSONB NOT NULL DEFAULT '[]'::jsonb;

-- -----------------------------------------------------------------------------
-- 3. STAGE 4->8 & COLLABORATION TABLES
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.triage_reviews (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
    cluster_id TEXT NOT NULL,
    reviewer_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    reviewer_email TEXT NOT NULL,
    decision TEXT NOT NULL CHECK (decision IN ('APPROVED', 'REJECTED', 'PENDING')),
    notes TEXT,
    citations JSONB NOT NULL DEFAULT '[]'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.release_validations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
    cluster_id TEXT NOT NULL,
    release_tag TEXT NOT NULL DEFAULT 'v2.4.0',
    pre_release_ticket_rate NUMERIC(6, 2) NOT NULL DEFAULT 0,
    post_release_ticket_rate NUMERIC(6, 2) NOT NULL DEFAULT 0,
    spike_detected BOOLEAN NOT NULL DEFAULT FALSE,
    regression_summary TEXT NOT NULL DEFAULT '',
    telemetry_verdict TEXT NOT NULL DEFAULT 'HEALTHY' CHECK (
        telemetry_verdict IN ('HEALTHY', 'MONITOR', 'REGRESSION_SPIKE')
    ),
    citations JSONB NOT NULL DEFAULT '[]'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.loop_closures (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
    cluster_id TEXT NOT NULL,
    channel TEXT NOT NULL CHECK (channel IN ('Zendesk', 'Discord', 'Email', 'Linear')),
    recipient_handle TEXT NOT NULL,
    ticket_ids JSONB NOT NULL DEFAULT '[]'::jsonb,
    draft_message TEXT NOT NULL,
    resolution_status TEXT NOT NULL DEFAULT 'DRAFT' CHECK (
        resolution_status IN ('DRAFT', 'READY_TO_SEND', 'SENT')
    ),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.activity_log (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
    actor_email TEXT NOT NULL,
    stage TEXT NOT NULL,
    action TEXT NOT NULL,
    detail TEXT NOT NULL DEFAULT '',
    citations JSONB NOT NULL DEFAULT '[]'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.chat_messages (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
    role TEXT NOT NULL CHECK (role IN ('user', 'assistant')),
    content TEXT NOT NULL,
    citations JSONB NOT NULL DEFAULT '[]'::jsonb,
    triggered_stage TEXT,
    model_used TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- -----------------------------------------------------------------------------
-- 4. INDEXES & ROW-LEVEL SECURITY (RLS)
-- -----------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_projects_owner_id ON public.projects(owner_id);
CREATE INDEX IF NOT EXISTS idx_project_members_project_id ON public.project_members(project_id);
CREATE INDEX IF NOT EXISTS idx_raw_tickets_project_id ON public.raw_tickets(project_id);
CREATE INDEX IF NOT EXISTS idx_clusters_project_id ON public.clusters(project_id);
CREATE INDEX IF NOT EXISTS idx_activity_log_project_id ON public.activity_log(project_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_chat_messages_project_id ON public.chat_messages(project_id, created_at ASC);

ALTER TABLE public.projects ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.project_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.triage_reviews ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.release_validations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.loop_closures ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.activity_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.chat_messages ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Project members can view projects" ON public.projects;
CREATE POLICY "Project members can view projects"
    ON public.projects FOR SELECT
    USING (owner_id = auth.uid() OR public.is_project_member(id));

DROP POLICY IF EXISTS "Users can create projects" ON public.projects;
CREATE POLICY "Users can create projects"
    ON public.projects FOR INSERT
    WITH CHECK (owner_id = auth.uid());

DROP POLICY IF EXISTS "Owners can update projects" ON public.projects;
CREATE POLICY "Owners can update projects"
    ON public.projects FOR UPDATE
    USING (owner_id = auth.uid())
    WITH CHECK (owner_id = auth.uid());

DROP POLICY IF EXISTS "Owners can delete projects" ON public.projects;
CREATE POLICY "Owners can delete projects"
    ON public.projects FOR DELETE
    USING (owner_id = auth.uid());

DROP POLICY IF EXISTS "Members can access project_members" ON public.project_members;
CREATE POLICY "Members can access project_members"
    ON public.project_members FOR ALL
    USING (public.is_project_member(project_id))
    WITH CHECK (public.is_project_member(project_id));

DROP POLICY IF EXISTS "Members can access triage_reviews" ON public.triage_reviews;
CREATE POLICY "Members can access triage_reviews"
    ON public.triage_reviews FOR ALL
    USING (public.is_project_member(project_id))
    WITH CHECK (public.is_project_member(project_id));

DROP POLICY IF EXISTS "Members can access release_validations" ON public.release_validations;
CREATE POLICY "Members can access release_validations"
    ON public.release_validations FOR ALL
    USING (public.is_project_member(project_id))
    WITH CHECK (public.is_project_member(project_id));

DROP POLICY IF EXISTS "Members can access loop_closures" ON public.loop_closures;
CREATE POLICY "Members can access loop_closures"
    ON public.loop_closures FOR ALL
    USING (public.is_project_member(project_id))
    WITH CHECK (public.is_project_member(project_id));

DROP POLICY IF EXISTS "Members can access activity_log" ON public.activity_log;
CREATE POLICY "Members can access activity_log"
    ON public.activity_log FOR ALL
    USING (public.is_project_member(project_id))
    WITH CHECK (public.is_project_member(project_id));

DROP POLICY IF EXISTS "Members can access chat_messages" ON public.chat_messages;
CREATE POLICY "Members can access chat_messages"
    ON public.chat_messages FOR ALL
    USING (public.is_project_member(project_id))
    WITH CHECK (public.is_project_member(project_id));

-- -----------------------------------------------------------------------------
-- 5. ATOMIC WORKSPACE SNAPSHOT TABLE (8-Stage State Sync under Project RLS)
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.project_workspaces (
    project_id UUID PRIMARY KEY REFERENCES public.projects(id) ON DELETE CASCADE,
    batch_name TEXT NOT NULL DEFAULT 'No data uploaded yet',
    state JSONB NOT NULL DEFAULT '{}'::jsonb,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.project_workspaces ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Members can access project_workspaces" ON public.project_workspaces;
CREATE POLICY "Members can access project_workspaces"
    ON public.project_workspaces FOR ALL
    USING (public.is_project_member(project_id))
    WITH CHECK (public.is_project_member(project_id));
