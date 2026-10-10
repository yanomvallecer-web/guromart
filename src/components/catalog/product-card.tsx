import Link from "next/link";
import { FileText, Star } from "lucide-react";
import type { ProductCard as Card } from "@/lib/catalog/queries";
import { displayTitle, fileFacts, gradeSummary, lengthUnit, shortTypeLabel, typeName } from "@/lib/catalog/labels";
import { formatPrice } from "@/lib/format";
import { publicObjectUrl } from "@/lib/storage";
import { cn } from "@/lib/utils";

export function ProductCard({ product }: { product: Card }) {
  const type = shortTypeLabel(product.category_code, product.category);
  const title = displayTitle(product);
  const context = [gradeSummary(product.grades), product.subject, typeName(product.category_code, product.category)].filter(Boolean).join(" · ");
  const facts = fileFacts(product).join(" · ");
  const slides = lengthUnit(product.category_code, product.file_formats) === "slide";
  const free = product.price_centavos === 0;
  return (
    <Link href={`/resources/${product.slug}`} className="group flex h-full flex-col gap-2.5 rounded-[12px] text-foreground no-underline">
      {/* One 4:3 frame for every card. Slides fit whole; pages show their top, where the title is. */}
      <div className="relative aspect-[4/3] overflow-hidden rounded-[12px] border border-border bg-surface">
        {product.preview_path ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={publicObjectUrl("product-previews", product.preview_path)}
            alt=""
            loading="lazy"
            decoding="async"
            className={cn(
              "size-full transition-transform motion-safe:group-hover:scale-[1.02]",
              slides ? "object-contain" : "object-cover object-top",
            )}
          />
        ) : (
          <CoverTemplate title={title} type={type} context={context} />
        )}
        {type && product.preview_path ? (
          <span className="absolute left-2 top-2 max-w-[calc(100%-1rem)] truncate rounded-full bg-foreground/85 px-2.5 py-0.5 text-xs font-bold text-white">
            {type}
            <span className="sr-only">: </span>
          </span>
        ) : null}
      </div>
      <div className="flex flex-1 flex-col gap-1">
        <h3 className="line-clamp-2 text-base font-bold leading-snug group-hover:text-primary group-hover:underline">{title}</h3>
        {context ? <p className="line-clamp-2 text-sm leading-snug text-muted-foreground">{context}</p> : null}
        {facts ? <p className="truncate text-xs font-medium text-muted-foreground">{facts}</p> : null}
        <div className="mt-auto flex flex-wrap items-center justify-between gap-x-2 pt-1">
          <span className={cn("text-base font-bold", free && "text-success")}>{formatPrice(product.price_centavos)}</span>
          {product.rating_count > 0 ? (
            <span className="flex items-center gap-1 text-sm text-muted-foreground">
              <Star className="size-4 fill-accent text-accent" aria-hidden />
              {product.rating_avg.toFixed(1)} <span className="sr-only">out of 5,</span>({product.rating_count})
            </span>
          ) : null}
        </div>
        {product.storefront ? <p className="truncate text-xs text-muted-foreground">by {product.storefront.name}</p> : null}
      </div>
    </Link>
  );
}

/** Stands in for a missing preview: the same frame, with the topic written large enough to read. */
function CoverTemplate({ title, type, context }: { title: string; type: string | null; context: string }) {
  return (
    <div aria-hidden className="flex size-full flex-col justify-between gap-2 bg-primary-soft p-3 sm:p-4">
      <span className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wide text-primary">
        <FileText className="size-4" />
        {type ?? "Resource"}
      </span>
      <span className="line-clamp-3 font-display text-base font-bold leading-tight text-foreground sm:text-lg">{title}</span>
      <span className="truncate text-xs text-muted-foreground">{context}</span>
    </div>
  );
}

/** Two cards per row from 360px (most phones), more on wider screens. */
const GRID = "grid grid-cols-1 gap-x-3 gap-y-6 min-[360px]:grid-cols-2 sm:gap-x-5 sm:gap-y-8 md:grid-cols-3 lg:grid-cols-4";

export function ProductGrid({ products, className }: { products: Card[]; className?: string }) {
  return (
    <ul className={cn(GRID, className)}>
      {products.map((p) => (
        <li key={p.id} className="min-w-0">
          <ProductCard product={p} />
        </li>
      ))}
    </ul>
  );
}

export function ProductGridSkeleton({ count = 4, className }: { count?: number; className?: string }) {
  return (
    <div className={cn(GRID, className)} aria-hidden>
      {Array.from({ length: count }, (_, i) => (
        <div key={i} className="flex flex-col gap-2">
          <div className="aspect-[4/3] animate-pulse rounded-[12px] bg-border/70" />
          <div className="h-4 w-3/4 animate-pulse rounded bg-border/70" />
          <div className="h-4 w-1/2 animate-pulse rounded bg-border/70" />
        </div>
      ))}
    </div>
  );
}
