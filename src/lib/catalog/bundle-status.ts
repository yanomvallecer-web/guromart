export const BUNDLE_STATUS: Record<string, { label: string; tone: string }> = {
  draft: { label: "Draft", tone: "bg-surface-muted text-foreground" },
  published: { label: "Live", tone: "bg-success-soft text-success" },
  hidden: { label: "Hidden by GuroMart", tone: "bg-danger-soft text-danger" },
};
