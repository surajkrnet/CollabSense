import React from 'react';

interface PostHogDesktopShellProps {
  children: React.ReactNode;
  onQuickJumpSection?: (sectionId: string) => void;
}

export const PostHogBrandMark: React.FC<{
  size?: 'sm' | 'md' | 'lg';
  showText?: boolean;
  textLabel?: string;
  variant?: 'orange' | 'light' | 'ink';
}> = ({ size = 'md', showText = true, textLabel = 'COLLABSENSE', variant = 'orange' }) => {
  const badgeDims =
    size === 'sm' ? 'h-6 px-2 text-xs' : size === 'lg' ? 'h-9 px-3 text-base' : 'h-7 px-2.5 text-sm';
  const wordSize =
    size === 'sm' ? 'text-xl' : size === 'lg' ? 'text-3xl sm:text-4xl' : 'text-2xl';
  const textColor =
    variant === 'light' ? 'text-[#F8EEE8]' : variant === 'ink' ? 'text-[#111111]' : 'text-[#FF5400]';
  const pillColors =
    variant === 'light'
      ? 'bg-[#F8EEE8] text-[#FF5400]'
      : 'bg-[#FF5400] text-[#FFFFFF]';

  return (
    <span className="inline-flex items-center gap-2 select-none">
      {showText && (
        <span
          className={`two26-display font-black uppercase tracking-tight leading-none ${wordSize} ${textColor}`}
        >
          {textLabel}
        </span>
      )}
      <span
        className={`two26-display inline-flex items-center justify-center rounded-full font-black uppercase tracking-tight leading-none ${badgeDims} ${pillColors}`}
      >
        26
      </span>
    </span>
  );
};

/** Every route into the product goes through /login first; AuthGuard enforces it again on protected routes. */
export function loginFor(next?: string): string {
  return next ? `/login?next=${encodeURIComponent(next)}` : '/login';
}

export const PostHogDesktopShell: React.FC<PostHogDesktopShellProps> = ({ children }) => {
  return (
    <div
      data-testid="landing-top-menubar"
      className="desk-surface relative min-h-screen w-full overflow-x-hidden selection:bg-[#FF5400] selection:text-white"
    >
      {children}
    </div>
  );
};
