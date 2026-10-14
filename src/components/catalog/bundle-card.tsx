import Link from "next/link";
import { Layers } from "lucide-react";
import type { BundleCard as Card } from "@/lib/catalog/bundles";
import { formatPrice } from "@/lib/format";
import { publicObjectUrl } from "@/lib/storage";
import { cn } from "@/lib/utils";

/**
 * A bundle's picture: the covers of the resources inside it, side by side.
 * One cover fills the frame; two sit side by side; three put the first one
 * large; four make a 2 by 2 grid.
 */
export function BundleCover({ paths, title, className }: { paths: string[]; title: string; className?: string }) {
  const shown = paths.slice(0, 4);
  const layout = ["", "grid-cols-1", "grid-cols-2", "grid-cols-2 grid-rows-2", "grid-cols-2 grid-rows-2"][shown.length];
  return (
    <div className={cn("relative aspect-[4/3] overflow-hidden rounded-[12px] border border-border bg-surface", className)} data-testid="bundle-cover">
      {shown.length ? (
        <div className={cn("grid size-full gap-0.5 bg-border", layout)}>
          {shown.map((p, i) => (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              key={p}
              src={publicObjectUrl("product-previews", p)}
              alt=""
              loading="lazy"
              decoding="async"
              className={cn("size-full bg-surface object-cover object-top", shown.length === 3 && i === 0 && "row-span-2")}
            />
          ))}
        </div>
      ) : (
        <div aria-hidden className="flex size-full flex-col justify-center gap-2 bg-primary-soft p-4">
          <span className="line-clamp-3 font-display text-lg font-bold leading-tight">{title}</span>
        </div>
      )}
    </div>
  );
}

/** A lesson bundle in a grid of resource cards, marked as a bundle with its saving. */
export function BundleCard({ bundle }: { bundle: Card }) {
  const title = bundle.title;
  const saving = bundle.separate_centavos - bundle.price_centavos;
  return (
    <Link href={`/bundles/${bundle.slug}`} className="group flex h-full flex-col gap-2.5 rounded-[12px] text-foreground no-underline" data-testid="bundle-card">
      <div className="relative">
        <BundleCover paths={bundle.cover_paths} title={title} />
        <span className="absolute left-2 top-2 flex items-center gap-1 rounded-full bg-accent px-2.5 py-0.5 text-xs font-bold text-foreground">
          <Layers className="size-3.5" aria-hidden />
          Bundle · {bundle.item_count} resources
          <span className="sr-only">: </span>
        </span>
      </div>
      <div className="flex flex-1 flex-col gap-1">
        <h3 className="line-clamp-2 text-base font-bold leading-snug group-hover:text-primary group-hover:underline">{title}</h3>
        <div className="mt-auto flex flex-wrap items-center gap-x-2 pt-1">
          <span className="text-base font-bold">{formatPrice(bundle.price_centavos)}</span>
          {saving > 0 ? <span className="text-sm font-semibold text-success">Save {formatPrice(saving)}</span> : null}
        </div>
        {bundle.storefront ? <p className="truncate text-xs text-muted-foreground">by {bundle.storefront.name}</p> : null}
      </div>
    </Link>
  );
}
