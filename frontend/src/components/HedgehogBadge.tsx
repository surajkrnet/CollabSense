import React from 'react';

interface HedgehogBadgeProps {
  label?: string;
  sublabel?: string;
  size?: 'sm' | 'md' | 'lg';
}

export const HedgehogBadge: React.FC<HedgehogBadgeProps> = ({
  label = 'CollabSense Triage Desk',
  sublabel = 'Deterministic math boundary active',
  size = 'md',
}) => {
  const iconDimensions = size === 'sm' ? 'w-7 h-7' : size === 'lg' ? 'w-12 h-12' : 'w-9 h-9';

  return (
    <div className="inline-flex items-center gap-2.5 stock-card px-3 py-1.5">
      <div
        className={`${iconDimensions} bg-paper-2 border border-rule-2 rounded-input flex items-center justify-center shrink-0 text-ink`}
        title="CollabSense Triage Emblem"
      >
        <svg
          viewBox="0 0 32 32"
          className="w-5/6 h-5/6"
          fill="none"
          aria-hidden="true"
          xmlns="http://www.w3.org/2000/svg"
        >
          <path
            d="M4 18L7 9L11 12L15 7L19 12L23 8L26 15L28 19H4Z"
            fill="currentColor"
          />
          <path
            d="M6 18C6 14.5 10 13 16 13C22 13 27 15.5 27 20C27 23 23 25 16 25H8C6.5 25 6 23 6 18Z"
            fill="currentColor"
            fillOpacity="0.18"
            stroke="currentColor"
            strokeWidth="2"
          />
          <circle cx="26" cy="19" r="2" fill="currentColor" />
        </svg>
      </div>
      <div className="leading-tight">
        <div className="text-xs font-semibold text-ink">{label}</div>
        {sublabel && <div className="text-xs text-paid">{sublabel}</div>}
      </div>
    </div>
  );
};
