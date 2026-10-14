import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

/**
 * GuroMart's blue banner with two soft circles, used at the top of pages.
 * Links inside turn white; a yellow (accent) button keeps its own colors.
 */
export function BrandBanner({ children, className, label }: { children: ReactNode; className?: string; label?: string }) {
  return (
    <section
      aria-label={label}
      className={cn(
        "relative overflow-hidden rounded-[16px] bg-primary p-6 text-primary-foreground sm:p-8",
        "[&_a:not(.bg-accent):not(.bg-white):not(.bg-surface)]:text-primary-foreground [&_a:not(.bg-accent):not(.bg-white):not(.bg-surface)]:underline [&_a:not(.bg-accent):not(.bg-white):not(.bg-surface)]:underline-offset-4",
        className,
      )}
    >
      <BannerCircles />
      <div className="relative">{children}</div>
    </section>
  );
}

/** The banner's decoration, on its own for full-width banners such as the homepage's. */
export function BannerCircles() {
  return (
    <>
      <div aria-hidden className="pointer-events-none absolute -right-16 -top-20 size-64 rounded-full bg-white/10" />
      <div aria-hidden className="pointer-events-none absolute -bottom-28 left-1/3 size-56 rounded-full bg-white/5" />
    </>
  );
}

export function PageShell({
  title,
  description,
  children,
  actions,
  plain = false,
}: {
  title: string;
  description?: ReactNode;
  children: ReactNode;
  actions?: ReactNode;
  /** A plain title, for pages that put their own banner right under it. */
  plain?: boolean;
}) {
  const heading = (
    <div className="flex flex-wrap items-end justify-between gap-4">
      <div>
        <h1 className="font-display text-3xl font-bold">{title}</h1>
        {description ? <p className={cn("mt-1", plain ? "text-muted-foreground" : "text-primary-foreground/85")}>{description}</p> : null}
      </div>
      {actions}
    </div>
  );
  return (
    <div className="mx-auto flex max-w-[1200px] flex-col gap-8 px-4 py-10 sm:px-6">
      {plain ? heading : <BrandBanner>{heading}</BrandBanner>}
      {children}
    </div>
  );
}

export function PanelSkeleton() {
  return <div className="h-64 animate-pulse rounded-[12px] bg-border/50" aria-hidden />;
}
