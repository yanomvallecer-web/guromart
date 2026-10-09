export const LISTING_STATUS: Record<string, { label: string; tone: string; hint: string }> = {
  draft: { label: "Draft", tone: "bg-surface-muted text-foreground", hint: "Only you can see it." },
  pending_review: { label: "In review", tone: "bg-accent-soft text-foreground", hint: "GuroMart staff are checking it before it goes live." },
  published: { label: "Live", tone: "bg-success-soft text-success", hint: "Teachers can find and buy it." },
  rejected: { label: "Needs changes", tone: "bg-danger-soft text-danger", hint: "Fix the issues below and submit again." },
  suspended: { label: "Suspended", tone: "bg-danger-soft text-danger", hint: "Hidden by GuroMart staff. Contact support." },
  archived: { label: "Archived", tone: "bg-surface-muted text-muted-foreground", hint: "Hidden from your shop." },
};
