import React from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Home,
  Calculator,
  Workflow,
  DollarSign,
  FileCode2,
  FolderKanban,
  LogIn,
  UserPlus,
  Terminal,
} from 'lucide-react';
import { getActiveProjectId } from '../lib/projects';

interface PostHogDesktopShellProps {
  children: React.ReactNode;
  onQuickJumpSection?: (sectionId: string) => void;
}

export const PostHogBrandMark: React.FC<{
  size?: 'sm' | 'md' | 'lg';
  showText?: boolean;
  textLabel?: string;
}> = ({ size = 'md', showText = true, textLabel = 'CollabSense' }) => {
  const scale = size === 'sm' ? 'h-5' : size === 'lg' ? 'h-8' : 'h-6';
  const textSize = size === 'sm' ? 'text-base' : size === 'lg' ? 'text-2xl' : 'text-xl';

  return (
    <span className="inline-flex items-center gap-2.5 select-none text-ink">
      <svg
        viewBox="0 0 46 28"
        className={`${scale} w-auto shrink-0`}
        fill="none"
        aria-hidden="true"
        xmlns="http://www.w3.org/2000/svg"
      >
        <path d="M2 26V6L11 11V26H2Z" fill="var(--color-ink)" fillOpacity="0.22" stroke="var(--color-ink)" strokeWidth="1.5" />
        <path d="M11 26V3L20 9V26H11Z" fill="var(--color-paid)" stroke="var(--color-ink)" strokeWidth="1.5" />
        <path d="M20 26V4L30 11V26H20Z" fill="var(--color-accent)" stroke="var(--color-ink)" strokeWidth="1.5" />
        <path d="M30 26V10L43 26H30Z" fill="var(--color-ink)" />
        <circle cx="34.5" cy="20.5" r="1.7" fill="var(--color-cotton)" />
      </svg>
      {showText && <span className={`font-bold tracking-tight text-ink ${textSize}`}>{textLabel}</span>}
    </span>
  );
};

/** Every route into the product goes through /login first; AuthGuard enforces it again server-side of the router. */
export function loginFor(next?: string): string {
  return next ? `/login?next=${encodeURIComponent(next)}` : '/login';
}

const DesktopIcon: React.FC<{
  label: string;
  icon: React.ElementType;
  onClick: () => void;
  testId?: string;
}> = ({ label, icon: Icon, onClick, testId }) => (
  <button
    type="button"
    onClick={onClick}
    data-testid={testId}
    className="desk-icon group flex w-20 flex-col items-center gap-1.5 rounded-input px-1 py-1.5 text-center"
  >
    <span className="flex h-11 w-11 items-center justify-center rounded-card border border-rule bg-cotton text-ink transition-colors group-hover:border-ink">
      <Icon className="h-5 w-5" aria-hidden="true" />
    </span>
    <span className="text-xs font-semibold leading-tight text-ink">{label}</span>
  </button>
);

export const PostHogDesktopShell: React.FC<PostHogDesktopShellProps> = ({ children, onQuickJumpSection }) => {
  const navigate = useNavigate();
  const pid = getActiveProjectId();

  const handleShortcutClick = (target: string) => {
    if (target === 'home') onQuickJumpSection?.('top');
    else if (target === 'workflow') onQuickJumpSection?.('product-os');
    else if (target === 'math') onQuickJumpSection?.('step-data-in');
    else if (target === 'mcp') onQuickJumpSection?.('step-mcp');
    else if (target === 'pricing') onQuickJumpSection?.('pricing-calculator');
    else if (target === 'projects') navigate(loginFor('/projects'));
  };

  return (
    <div className="desk-surface relative min-h-screen w-full">
      {/* Left desktop icons: in-page navigation only */}
      <aside
        data-testid="landing-left-shortcuts"
        aria-label="Page sections"
        className="fixed left-5 top-8 z-20 hidden flex-col items-center gap-3 xl:flex"
      >
        <DesktopIcon label="Home" icon={Home} onClick={() => handleShortcutClick('home')} />
        <DesktopIcon label="Workflow" icon={Workflow} onClick={() => handleShortcutClick('workflow')} />
        <DesktopIcon label="Scoring" icon={Calculator} onClick={() => handleShortcutClick('math')} />
        <DesktopIcon label="Ingest" icon={Terminal} onClick={() => handleShortcutClick('mcp')} />
        <DesktopIcon label="Pricing" icon={DollarSign} onClick={() => handleShortcutClick('pricing')} />
      </aside>

      {/* Right desktop icons: everything here needs an account, so each one opens sign in first */}
      <aside
        data-testid="landing-right-shortcuts"
        aria-label="Account and workspace"
        className="fixed right-5 top-8 z-20 hidden flex-col items-center gap-3 xl:flex"
      >
        <DesktopIcon label="Sign in" icon={LogIn} onClick={() => navigate('/login')} testId="right-signin" />
        <DesktopIcon label="Sign up" icon={UserPlus} onClick={() => navigate('/signup')} testId="right-signup" />
        <DesktopIcon label="Projects" icon={FolderKanban} onClick={() => handleShortcutClick('projects')} />
        <DesktopIcon
          label="PRD Studio"
          icon={FileCode2}
          onClick={() => navigate(loginFor(`/app/${pid}/prd`))}
        />
      </aside>

      {/* Wide centre column: grows between the icon rails, capped at 1440px */}
      <div
        data-testid="landing-top-menubar"
        className="mx-auto w-full max-w-[1440px] px-4 pb-16 pt-6 sm:px-8 xl:px-32"
      >
        {children}
      </div>
    </div>
  );
};
