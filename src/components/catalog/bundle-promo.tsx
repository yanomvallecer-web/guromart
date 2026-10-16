import Link from "next/link";
import { ArrowRight, Layers } from "lucide-react";
import { cn } from "@/lib/utils";

/** A static discovery link: visible immediately, even while the catalogue streams. */
export function BundlePromo({ className }: { className?: string }) {
  return (
    <aside aria-label="Discover lesson bundles" className={cn("min-w-0", className)}>
      <Link
        href="/bundles"
        aria-label="Explore lesson bundles"
        className="group grid min-h-[76px] grid-cols-[40px_minmax(0,1fr)_20px] items-center gap-3 rounded-[16px] border border-primary/15 bg-primary-soft p-3 text-foreground transition-colors hover:border-primary/40 hover:bg-primary-soft/80 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary sm:gap-4 sm:px-4"
      >
        <span className="flex size-10 items-center justify-center rounded-xl bg-accent-soft text-primary"><Layers className="size-6" aria-hidden /></span>
        <span className="min-w-0">
          <span className="block font-display text-[15px] font-extrabold leading-snug">Lesson bundles</span>
          <span className="mt-0.5 block text-[13px] leading-snug text-muted-foreground">Teaching resources, together. <span className="font-semibold text-primary">Explore bundles</span></span>
        </span>
        <ArrowRight className="size-5 text-primary transition-transform motion-safe:group-hover:translate-x-0.5" aria-hidden />
      </Link>
    </aside>
  );
}
