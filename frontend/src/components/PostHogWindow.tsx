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
    yellow: 'bg-paper-2 text-ink border-rule-2',
    orange: 'stamp-settled',
    green: 'cs-badge-verified',
    ink: 'bg-paper-2 text-ink-2 border-rule',
  };

  return (
    <div className={`stock-card border border-rule overflow-hidden ${className}`}>
      <div className="bg-paper-2 border-b border-rule px-4 py-2.5 flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2.5 min-w-0">
          <div className="font-semibold text-xs sm:text-sm text-ink truncate">{title}</div>
          {path && (
            <code className="hidden md:inline-block font-mono text-xs text-muted bg-paper px-2 py-0.5 rounded-input border border-rule truncate">
              {path}
            </code>
          )}
        </div>

        <div className="flex items-center gap-2 shrink-0">
          {badgeText && (
            <span
              className={`text-xs font-medium px-2.5 py-0.5 rounded-input border ${badgeColorMap[badgeVariant]}`}
            >
              {badgeText}
            </span>
          )}
          {rightSlot}
        </div>
      </div>

      <div className="p-4 sm:p-5 bg-cotton">{children}</div>
    </div>
  );
};
