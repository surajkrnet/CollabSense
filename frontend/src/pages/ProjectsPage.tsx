import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  FolderPlus,
  ArrowRight,
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
      <header className="max-w-6xl w-full mx-auto flex flex-wrap items-center justify-between gap-3 pb-4 border-b border-rule">
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => navigate('/')}
            className="flex items-center gap-2 hover:opacity-80"
          >
            <PostHogBrandMark size="md" textLabel="CollabSense" />
          </button>
          <span className="text-xs bg-paper-2 border border-rule px-2.5 py-0.5 rounded-input text-ink-2">
            Project workspace gate
          </span>
        </div>

        <div className="flex items-center gap-3">
          <span className="text-xs text-ink-2">
            Signed in as <strong className="text-ink">{user.fullName}</strong>
          </span>
          <button
            type="button"
            onClick={handleLogout}
            className="cs-btn-secondary text-xs py-1.5 px-2.5 whitespace-nowrap"
          >
            <LogOut className="w-3.5 h-3.5" />
            <span>Sign out</span>
          </button>
        </div>
      </header>

      <main className="max-w-6xl w-full mx-auto my-6 grid grid-cols-1 lg:grid-cols-12 gap-6 items-start flex-1">
        <div className="lg:col-span-7 space-y-4">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight text-ink">
              Select or create a project workspace
            </h1>
            <p className="text-xs sm:text-sm text-ink-2 mt-1">
              Each project maintains isolated feedback batches, noise filters, Gate 1 approvals,
              deterministic prioritization scores, and Gherkin PRDs with zero cross-project leakage.
            </p>
          </div>

          <div className="space-y-3">
            {loadingProjects && projects.length === 0 && (
              <div className="cs-card p-6 text-center text-xs text-ink-2">
                Syncing your project workspaces…
              </div>
            )}
            {!loadingProjects && projects.length === 0 && (
              <div className="cs-card p-6 space-y-2 text-center">
                <div className="text-sm font-semibold text-ink">No project workspaces yet</div>
                <p className="text-xs text-ink-2">
                  Create your first blank project on the right, then upload your customer feedback
                  to run all 8 workflow stages.
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
                      ? 'cs-card-selected p-5 transition-colors'
                      : 'cs-card p-5 transition-colors'
                  }
                >
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="space-y-1.5 flex-1 min-w-[220px]">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="w-6 h-6 rounded-input bg-board text-board-type text-xs font-semibold flex items-center justify-center">
                          {proj.name.charAt(0).toUpperCase()}
                        </span>
                        <h2 className="text-base font-semibold text-ink">{proj.name}</h2>
                        <code className="font-mono text-xs bg-paper-2 border border-rule px-2 py-0.5 rounded-input text-muted">
                          {proj.id}
                        </code>
                      </div>
                      <p className="text-xs text-ink-2 leading-relaxed">{proj.description}</p>
                      <div className="flex items-center gap-1.5 text-xs text-ink bg-paper border border-rule rounded-input px-2.5 py-1.5">
                        <Target className="w-3.5 h-3.5 text-paid shrink-0" />
                        <span className="truncate">{proj.okr_focus}</span>
                      </div>
                    </div>

                    <div className="flex items-center gap-2 shrink-0">
                      <button
                        type="button"
                        data-testid={`open-project-btn-${proj.id}`}
                        onClick={() => handleSelectProject(proj.id)}
                        className="cs-btn-primary text-xs shrink-0 whitespace-nowrap"
                      >
                        <span>Open workspace</span>
                        <ArrowRight className="w-3.5 h-3.5" />
                      </button>
                      <button
                        type="button"
                        onClick={() => handleDeleteProject(proj.id)}
                        className="p-2 rounded-input border border-rule text-muted hover:text-error hover:border-error transition-colors"
                        title="Delete project"
                        aria-label={`Delete ${proj.name}`}
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>

                  <div className="mt-3 pt-3 border-t border-rule flex flex-wrap items-center justify-between gap-2 text-xs text-ink-2">
                    <div className="flex flex-wrap items-center gap-3">
                      <span className="inline-flex items-center gap-1">
                        <Layers className="w-3.5 h-3.5 text-paid" />
                        <strong className="fig font-mono">{ws.tickets.length}</strong> tickets
                      </span>
                      <span className="inline-flex items-center gap-1">
                        <CheckCircle2 className="w-3.5 h-3.5 text-success" />
                        <strong className="fig font-mono">{approvedCount}</strong>/
                        <span className="fig font-mono">{ws.clusters.length}</span> Gate 1 approved
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
          <div className="stock-card border border-rule overflow-hidden">
            <div className="bg-paper-2 border-b border-rule px-4 py-3 flex items-center justify-between">
              <div className="flex items-center gap-2 font-semibold text-sm text-ink">
                <FolderPlus className="w-4 h-4 text-paid" />
                <span>Create new project workspace</span>
              </div>
              <span className="text-xs bg-cotton border border-rule px-2 py-0.5 rounded-input font-medium">
                Isolated memory
              </span>
            </div>

            <form onSubmit={handleCreateProject} className="p-5 space-y-4">
              <div>
                <label htmlFor="new-proj-name" className="block text-xs font-medium text-ink mb-1">
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
                <label htmlFor="new-proj-desc" className="block text-xs font-medium text-ink mb-1">
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
                <label htmlFor="new-proj-okr" className="block text-xs font-medium text-ink mb-1">
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
                className="w-full cs-btn-primary py-2.5 text-xs whitespace-nowrap"
              >
                <Sparkles className="w-4 h-4" />
                <span>
                  {creating ? 'Provisioning project memory…' : 'Create project and launch OS'}
                </span>
              </button>
            </form>
          </div>
        </div>
      </main>

      <footer className="max-w-6xl w-full mx-auto pt-4 border-t border-rule flex flex-wrap items-center justify-between gap-2 text-xs text-muted">
        <span className="flex items-center gap-1.5">
          <ShieldCheck className="w-4 h-4 text-success" />
          <span>Isolated project workspaces</span>
        </span>
        <span>CollabSense</span>
      </footer>
    </div>
  );
};
