import Link from "next/link";
import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

export const STAT_TONES = {
  green: "bg-success-soft text-success",
  blue: "bg-primary-soft text-primary",
  yellow: "bg-accent-soft text-foreground",
  red: "bg-danger-soft text-danger",
} as const;

/** A number with a colored icon, as on the seller dashboard. Links when given an href. */
export function StatTile({
  label,
  value,
  icon: Icon,
  tone,
  href,
  note,
  valueTestId,
}: {
  label: string;
  value: ReactNode;
  icon: LucideIcon;
  tone: keyof typeof STAT_TONES;
  href?: string;
  note?: ReactNode;
  valueTestId?: string;
}) {
  const body = (
    <>
      <span className={cn("flex size-11 shrink-0 items-center justify-center rounded-full", STAT_TONES[tone])}>
        <Icon className="size-5" aria-hidden />
      </span>
      <span className="flex min-w-0 flex-col">
        <span className="truncate font-display text-xl font-bold sm:text-2xl" data-testid={valueTestId}>{value}</span>
        <span className="text-sm text-muted-foreground">{label}</span>
        {note ? <span className="mt-1 text-xs text-muted-foreground">{note}</span> : null}
      </span>
    </>
  );
  const className = "flex h-full items-center gap-3 rounded-[12px] border border-border bg-surface p-4 text-foreground no-underline";
  return href ? (
    <Link href={href} className={cn(className, "transition hover:-translate-y-0.5 hover:shadow-md")}>
      {body}
    </Link>
  ) : (
    <div className={className}>{body}</div>
  );
}
