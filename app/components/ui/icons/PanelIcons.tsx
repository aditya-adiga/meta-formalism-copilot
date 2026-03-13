/** Icons for the panel rail. Each is a 20x20 SVG. */

type IconProps = { className?: string };

/** Document/page icon for Source Input */
export function SourceIcon({ className }: IconProps) {
  return (
    <svg className={className} width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M6 2h8l4 4v12a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1V3a1 1 0 0 1 1-1z" />
      <polyline points="13 2 13 6 18 6" />
      <line x1="8" y1="10" x2="15" y2="10" />
      <line x1="8" y1="13" x2="15" y2="13" />
    </svg>
  );
}

/** Compass/direction icon for Context */
export function ContextIcon({ className }: IconProps) {
  return (
    <svg className={className} width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="10" cy="10" r="8" />
      <polygon points="13.5 6.5 8 8 6.5 13.5 12 12 13.5 6.5" fill="currentColor" opacity="0.2" stroke="currentColor" />
    </svg>
  );
}

/** Pen/proof icon for Semiformal Proof */
export function SemiformalIcon({ className }: IconProps) {
  return (
    <svg className={className} width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M14.5 2.5l3 3L6 17H3v-3L14.5 2.5z" />
      <line x1="12" y1="5" x2="15" y2="8" />
    </svg>
  );
}

/** Code brackets icon for Lean4 */
export function LeanIcon({ className }: IconProps) {
  return (
    <svg className={className} width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="6 4 2 10 6 16" />
      <polyline points="14 4 18 10 14 16" />
      <line x1="12" y1="3" x2="8" y2="17" />
    </svg>
  );
}

/** Graph/network icon for Dependency Graph */
export function GraphIcon({ className }: IconProps) {
  return (
    <svg className={className} width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="10" cy="4" r="2" />
      <circle cx="5" cy="14" r="2" />
      <circle cx="15" cy="14" r="2" />
      <line x1="10" y1="6" x2="5" y2="12" />
      <line x1="10" y1="6" x2="15" y2="12" />
    </svg>
  );
}

/** Causal/arrow-split icon for Causal Graph */
export function CausalGraphIcon({ className }: IconProps) {
  return (
    <svg className={className} width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="4" cy="10" r="2" />
      <circle cx="16" cy="5" r="2" />
      <circle cx="16" cy="15" r="2" />
      <path d="M6 9l8-3" />
      <path d="M6 11l8 3" />
    </svg>
  );
}


/** Bar chart icon for Analytics */
export function AnalyticsIcon({ className }: IconProps) {
  return (
    <svg className={className} width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="10" width="3" height="7" rx="0.5" />
      <rect x="8.5" y="6" width="3" height="11" rx="0.5" />
      <rect x="14" y="3" width="3" height="14" rx="0.5" />
    </svg>
  );
}

/** Bell curve / distribution icon for Statistical Model */
export function StatisticalModelIcon({ className }: IconProps) {
  return (
    <svg className={className} width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M2 16 C4 16, 5 14, 7 10 C8 7, 9 3, 10 3 C11 3, 12 7, 13 10 C15 14, 16 16, 18 16" />
      <line x1="2" y1="16" x2="18" y2="16" />
    </svg>
  );
}

/** Checklist/property icon for Property Tests */
export function PropertyTestsIcon({ className }: IconProps) {
  return (
    <svg className={className} width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="3 5 5 7 8 3" />
      <line x1="10" y1="5" x2="17" y2="5" />
      <polyline points="3 10 5 12 8 8" />
      <line x1="10" y1="10" x2="17" y2="10" />
      <polyline points="3 15 5 17 8 13" />
      <line x1="10" y1="15" x2="17" y2="15" />
    </svg>
  );
}

/** Scales/balance icon for Balanced Perspectives */
export function PerspectiveBalanceIcon({ className }: IconProps) {
  return (
    <svg className={className} width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <line x1="10" y1="2" x2="10" y2="18" />
      <line x1="3" y1="6" x2="17" y2="6" />
      <path d="M3 6 L5 12 H1 Z" />
      <path d="M17 6 L19 12 H15 Z" />
      <line x1="7" y1="18" x2="13" y2="18" />
    </svg>
  );
}


/** Detail/inspect icon for Node Detail */
export function NodeDetailIcon({ className }: IconProps) {
  return (
    <svg className={className} width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="9" cy="9" r="6" />
      <line x1="13.5" y1="13.5" x2="18" y2="18" />
      <line x1="9" y1="6" x2="9" y2="12" />
      <line x1="6" y1="9" x2="12" y2="9" />
    </svg>
  );
}
