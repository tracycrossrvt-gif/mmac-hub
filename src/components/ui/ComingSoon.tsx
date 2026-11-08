// docs/DESIGN.md "Coming soon" pattern: a feature we aren't building renders
// as a non-link with aria-disabled and a small sand pill. Never a dead link.
export function ComingSoonPill() {
  return (
    <span className="rounded-full bg-sand px-2 py-0.5 text-xs font-medium text-text">
      Coming soon
    </span>
  );
}

export function ComingSoonItem({ label, className = "" }: { label: string; className?: string }) {
  return (
    <span aria-disabled="true" className={`inline-flex items-center gap-2 text-text/70 ${className}`}>
      {label}
      <ComingSoonPill />
    </span>
  );
}
