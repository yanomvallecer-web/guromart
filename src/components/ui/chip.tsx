import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

/**
 * A radio button or checkbox drawn as a tap chip. The real input stays in the
 * page (visually hidden), so forms, keyboards and screen readers work as usual.
 */
export function ChoiceChip({
  type = "radio",
  name,
  value,
  defaultChecked,
  children,
  className,
}: {
  type?: "radio" | "checkbox";
  name: string;
  value: string;
  defaultChecked?: boolean;
  children: ReactNode;
  className?: string;
}) {
  return (
    <label className={cn("relative inline-flex cursor-pointer", className)}>
      <input type={type} name={name} value={value} defaultChecked={defaultChecked} className="peer sr-only" />
      <span className="inline-flex min-h-11 items-center gap-1 rounded-full border border-input bg-surface px-4 text-sm font-semibold text-foreground transition-colors hover:border-primary peer-checked:border-primary peer-checked:bg-primary-soft peer-checked:text-primary peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-ring peer-disabled:cursor-not-allowed peer-disabled:opacity-60">
        {children}
      </span>
    </label>
  );
}

/** A labelled group of chips. */
export function ChipGroup({ legend, children, className }: { legend: ReactNode; children: ReactNode; className?: string }) {
  return (
    <fieldset className={cn("flex flex-col gap-2.5", className)}>
      <legend className="mb-2.5 text-sm font-semibold text-foreground">{legend}</legend>
      <div className="flex flex-wrap gap-2">{children}</div>
    </fieldset>
  );
}
