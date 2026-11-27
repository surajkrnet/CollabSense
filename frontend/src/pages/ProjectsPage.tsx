import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  FolderPlus,
  ArrowUpRight,
  Target,
  Layers,
  ShieldCheck,
  CheckCircle2,
  LogOut,
  Sparkles,
  Trash2,
} from 'lucide-react';
import { PostHogBrandMark } from '../components/PostHogDesktopShell';
import { CollabSenseUser, clearSessionUser } from '../lib/supabase';
import {
  CollabSenseProject,
  createNewProject,
  deleteProjectById,
  fetchProjectsFromSupabase,
  getSavedProjects,
  loadProjectWorkspaceData,
  setActiveProjectId,
} from '../lib/projects';

interface ProjectsPageProps {
  user: CollabSenseUser;
}

export const ProjectsPage: React.FC<ProjectsPageProps> = ({ user }) => {
  const navigate = useNavigate();
  const [projects, setProjects] = useState<CollabSenseProject[]>(() => getSavedProjects());
  const [loadingProjects, setLoadingProjects] = useState(true);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [okrFocus, setOkrFocus] = useState('');
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    let mounted = true;
    fetchProjectsFromSupabase(user.email).then(({ projects: synced }) => {
      if (!mounted) return;
      setProjects(synced);
      setLoadingProjects(false);
    });
    return () => {
      mounted = false;
    };
  }, [user.email]);

  const handleSelectProject = (projectId: string) => {
    setActiveProjectId(projectId);
    navigate(`/app/${projectId}/home`);
  };

  const handleDeleteProject = async (projectId: string) => {
    const remaining = await deleteProjectById(projectId);
    setProjects(remaining);
  };

  const handleCreateProject = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    setCreating(true);
    const created = await createNewProject({
      name,
      description,
      okr_focus: okrFocus,
      ownerEmail: user.email,
    });
    setProjects(getSavedProjects());
    setCreating(false);
    navigate(`/app/${created.id}/home`);
  };

  const handleLogout = async () => {
    await clearSessionUser();
    navigate('/login');
  };

  return (
    <div className="min-h-screen desk-surface text-ink flex flex-col justify-between p-4 sm:p-8">
      <header className="max-w-[1400px] w-full mx-auto flex flex-wrap items-center justify-between gap-3 pb-5 border-b border-rule">
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => navigate('/')}
            className="flex items-center gap-2 hover:opacity-80"
          >
            <PostHogBrandMark size="md" textLabel="COLLABSENSE" />
          </button>
          <span className="two26-sticker-pill text-xs px-3 py-1">
            Project Studio Hub
          </span>
        </div>

        <div className="flex items-center gap-3">
          <span className="text-xs text-ink-2">
            Signed in as <strong className="text-ink">{user.fullName}</strong>
          </span>
          <button
            type="button"
            onClick={handleLogout}
            className="two26-nav-pill text-xs border border-rule"
          >
            <LogOut className="w-3.5 h-3.5" />
            <span>Sign out</span>
          </button>
        </div>
      </header>

      <main className="max-w-[1400px] w-full mx-auto my-8 grid grid-cols-1 lg:grid-cols-12 gap-8 items-start flex-1">
        <div className="lg:col-span-7 space-y-5">
          <div>
            <div className="text-xs font-extrabold uppercase tracking-[0.16em] text-[#FF5400]">
              ISOLATED PRODUCT WORKSPACES
            </div>
            <h1 className="two26-display text-4xl sm:text-6xl text-[#111111] mt-1">
              SELECT OR CREATE A PROJECT
            </h1>
            <p className="text-xs sm:text-sm text-ink-2 mt-2 max-w-2xl">
              Each project maintains isolated feedback batches, Stage 2 noise filters, Stage 3/4 roadmap
              readiness decisions, deterministic RICE/WSJF scores, and Stage 6 Gherkin PRDs.
            </p>
          </div>

          <div className="space-y-4">
            {loadingProjects && projects.length === 0 && (
              <div className="cs-card p-6 text-center text-xs text-ink-2">
                Syncing your project workspaces…
              </div>
            )}
            {!loadingProjects && projects.length === 0 && (
              <div className="cs-card p-6 space-y-2 text-center">
                <div className="text-sm font-bold text-ink">No project workspaces yet</div>
                <p className="text-xs text-ink-2">
                  Create your first project on the right, then upload customer feedback to run all 8 workflow
                  stages.
                </p>
              </div>
            )}
            {projects.map((proj, index) => {
              const ws = loadProjectWorkspaceData(proj.id);
              const approvedCount = ws.clusters.filter((c) => c.gate1_status === 'APPROVED').length;
              return (
                <div
                  key={proj.id}
                  data-testid={`project-card-${proj.id}`}
                  className={
                    index === 0
                      ? 'cs-card-selected p-6 transition-all'
                      : 'cs-card p-6 hover:border-[#FF5400] transition-all'
                  }
                >
                  <div className="flex flex-wrap items-start justify-between gap-4">
                    <div className="space-y-2 flex-1 min-w-[220px]">
                      <div className="flex items-center gap-2.5 flex-wrap">
                        <span className="w-8 h-8 rounded-full bg-[#111111] text-[#FFFFFF] two26-display text-lg flex items-center justify-center">
                          {proj.name.charAt(0).toUpperCase()}
                        </span>
                        <h2 className="two26-display text-2xl sm:text-3xl text-ink">{proj.name}</h2>
                        <code className="font-mono text-xs bg-paper-2 border border-rule px-2.5 py-0.5 rounded-full text-muted">
                          {proj.id}
                        </code>
                      </div>
                      <p className="text-xs sm:text-sm text-ink-2 leading-relaxed">{proj.description}</p>
                      <div className="flex items-center gap-2 text-xs text-ink bg-paper border border-rule rounded-full px-3.5 py-1.5">
                        <Target className="w-3.5 h-3.5 text-[#FF5400] shrink-0" />
                        <span className="truncate font-medium">{proj.okr_focus}</span>
                      </div>
                    </div>

                    <div className="flex items-center gap-2 shrink-0">
                      <button
                        type="button"
                        data-testid={`open-project-btn-${proj.id}`}
                        onClick={() => handleSelectProject(proj.id)}
                        className="two26-cta-pill text-xs shrink-0"
                      >
                        <span>Open workspace</span>
                        <span className="two26-arrow-circle" aria-hidden="true">
                          <ArrowUpRight className="w-4 h-4" />
                        </span>
                      </button>
                      <button
                        type="button"
                        onClick={() => handleDeleteProject(proj.id)}
                        className="p-2.5 rounded-full border border-rule text-muted hover:text-error hover:border-error transition-colors"
                        title="Delete project"
                        aria-label={`Delete ${proj.name}`}
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>

                  <div className="mt-4 pt-3 border-t border-rule flex flex-wrap items-center justify-between gap-2 text-xs text-ink-2">
                    <div className="flex flex-wrap items-center gap-4">
                      <span className="inline-flex items-center gap-1.5">
                        <Layers className="w-3.5 h-3.5 text-[#FF5400]" />
                        <strong className="fig font-mono">{ws.tickets.length}</strong> tickets
                      </span>
                      <span className="inline-flex items-center gap-1.5">
                        <CheckCircle2 className="w-3.5 h-3.5 text-success" />
                        <strong className="fig font-mono">{approvedCount}</strong>/
                        <span className="fig font-mono">{ws.clusters.length}</span> Ready for Roadmap
                      </span>
                    </div>
                    <span className="cs-badge-verified">Verified citations active</span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        <div className="lg:col-span-5">
          <div className="bg-[#FFFFFF] border-2 border-[#111111] rounded-[24px] overflow-hidden">
            <div className="bg-[#FF5400] text-[#FFFFFF] px-5 py-4 flex items-center justify-between">
              <div className="flex items-center gap-2 font-extrabold text-sm uppercase tracking-wider">
                <FolderPlus className="w-4 h-4" />
                <span>Create New Project Workspace</span>
              </div>
              <span className="text-xs bg-[#111111] text-[#FFFFFF] px-3 py-0.5 rounded-full font-bold">
                Isolated memory
              </span>
            </div>

            <form onSubmit={handleCreateProject} className="p-6 space-y-4">
              <div>
                <label htmlFor="new-proj-name" className="block text-xs font-bold uppercase tracking-wider text-ink mb-1.5">
                  Project name <span className="text-error">*</span>
                </label>
                <input
                  id="new-proj-name"
                  type="text"
                  required
                  data-testid="new-project-name-input"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Q1 Enterprise Identity and Billing OS"
                  className="cs-input"
                />
              </div>

              <div>
                <label htmlFor="new-proj-desc" className="block text-xs font-bold uppercase tracking-wider text-ink mb-1.5">
                  Project description and scope
                </label>
                <textarea
                  id="new-proj-desc"
                  rows={3}
                  data-testid="new-project-desc-input"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="Describe target customer segment, feedback channels, and product scope…"
                  className="cs-input text-xs"
                />
              </div>

              <div>
                <label htmlFor="new-proj-okr" className="block text-xs font-bold uppercase tracking-wider text-ink mb-1.5">
                  OKR focus (stored in project AI memory)
                </label>
                <input
                  id="new-proj-okr"
                  type="text"
                  data-testid="new-project-okr-input"
                  value={okrFocus}
                  onChange={(e) => setOkrFocus(e.target.value)}
                  placeholder="O1: Reduce enterprise onboarding churn by 40%"
                  className="cs-input text-xs"
                />
              </div>

              <button
                type="submit"
                disabled={creating || !name.trim()}
                data-testid="create-project-submit-btn"
                className="w-full two26-cta-pill justify-center py-2.5 text-xs"
              >
                <Sparkles className="w-4 h-4 text-[#FF5400]" />
                <span>
                  {creating ? 'Provisioning project memory…' : 'Create project and launch OS'}
                </span>
                <span className="two26-arrow-circle" aria-hidden="true">
                  <ArrowUpRight className="w-4 h-4" />
                </span>
              </button>
            </form>
          </div>
        </div>
      </main>

      <footer className="max-w-[1400px] w-full mx-auto pt-4 border-t border-rule flex flex-wrap items-center justify-between gap-2 text-xs font-semibold text-muted">
        <span className="flex items-center gap-1.5">
          <ShieldCheck className="w-4 h-4 text-success" />
          <span>Isolated project workspaces · Supabase RLS</span>
        </span>
        <span>CollabSense Studio · v4.1.0</span>
      </footer>
    </div>
  );
};
