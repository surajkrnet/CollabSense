import React from 'react';

interface PostHogWindowProps {
  title: string;
  path?: string;
  badgeText?: string;
  badgeVariant?: 'yellow' | 'orange' | 'green' | 'ink';
  children: React.ReactNode;
  className?: string;
  rightSlot?: React.ReactNode;
}

export const PostHogWindow: React.FC<PostHogWindowProps> = ({
  title,
  path,
  badgeText,
  badgeVariant = 'yellow',
  children,
  className = '',
  rightSlot,
}) => {
  const badgeColorMap = {
    yellow: 'bg-paper-2 text-ink border-rule',
    orange: 'bg-[#FF5400] text-white border-[#FF5400] font-semibold',
    green: 'cs-badge-verified',
    ink: 'bg-[#111111] text-[#F8EEE8] border-[#111111]',
  };

  return (
    <div className={`stock-card border border-rule overflow-hidden ${className}`}>
      <div className="bg-paper-2/80 border-b border-rule px-5 py-3 flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2.5 min-w-0">
          <span className="w-2.5 h-2.5 rounded-full bg-[#FF5400] shrink-0" aria-hidden="true" />
          <div className="font-bold text-xs sm:text-sm text-ink truncate tracking-tight">{title}</div>
          {path && (
            <code className="hidden md:inline-block font-mono text-xs text-muted bg-cotton px-2.5 py-0.5 rounded-full border border-rule truncate">
              {path}
            </code>
          )}
        </div>

        <div className="flex items-center gap-2 shrink-0">
          {badgeText && (
            <span
              className={`text-xs font-medium px-3 py-0.5 rounded-full border ${badgeColorMap[badgeVariant]}`}
            >
              {badgeText}
            </span>
          )}
          {rightSlot}
        </div>
      </div>

      <div className="p-4 sm:p-6 bg-cotton">{children}</div>
    </div>
  );
};
