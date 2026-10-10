import Link from "next/link";
import { FileText, Star } from "lucide-react";
import type { ProductCard as Card } from "@/lib/catalog/queries";
import { shortTypeLabel } from "@/lib/catalog/labels";
import { formatPrice } from "@/lib/format";
import { publicObjectUrl } from "@/lib/storage";
import { cn } from "@/lib/utils";

export function ProductCard({ product }: { product: Card }) {
  const type = shortTypeLabel(product.category_code, product.category);
  return (
    <Link href={`/resources/${product.slug}`} className="group flex flex-col gap-2 text-foreground no-underline">
      {/* Portrait, like the page of a lesson plan or worksheet; landscape slides sit whole inside it. */}
      <div className="relative aspect-[3/4] overflow-hidden rounded-[12px] border border-border bg-accent-soft">
        {product.preview_path ? (
          <>
            {/* The whole cover shows, slides and pages alike; a soft blur of it fills the space around. */}
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={publicObjectUrl("product-previews", product.preview_path)}
              alt=""
              aria-hidden
              loading="lazy"
              className="absolute inset-0 size-full scale-110 object-cover opacity-60 blur-xl"
            />
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={publicObjectUrl("product-previews", product.preview_path)}
              alt=""
              loading="lazy"
              className="relative size-full object-contain transition-transform motion-safe:group-hover:scale-[1.02]"
            />
          </>
        ) : (
          <div className="flex size-full items-center justify-center text-primary/50">
            <FileText className="size-10" aria-hidden />
          </div>
        )}
        {type ? (
          <span className="absolute left-2 top-2 max-w-[calc(100%-1rem)] truncate rounded-full bg-surface/95 px-2.5 py-0.5 text-xs font-bold text-foreground shadow-sm">
            {type}
            <span className="sr-only">: </span>
          </span>
        ) : null}
      </div>
      <div className="flex flex-col gap-0.5">
        <h3 className="line-clamp-2 text-[15px] font-bold leading-snug group-hover:text-primary">{product.title}</h3>
        {product.storefront ? <p className="truncate text-sm text-muted-foreground">{product.storefront.name}</p> : null}
        <div className="mt-1 flex flex-wrap items-center justify-between gap-x-2">
          <span className={product.price_centavos === 0 ? "font-bold text-success" : "font-bold"}>
            {formatPrice(product.price_centavos)}
          </span>
          {product.rating_count > 0 ? (
            <span className="flex items-center gap-1 text-sm text-muted-foreground">
              <Star className="size-4 fill-accent text-accent" aria-hidden />
              {product.rating_avg.toFixed(1)} <span className="sr-only">out of 5,</span>({product.rating_count})
            </span>
          ) : null}
        </div>
      </div>
    </Link>
  );
}

/** Two cards per row from 360px (most phones), more on wider screens. */
const GRID = "grid grid-cols-1 gap-x-3 gap-y-6 min-[360px]:grid-cols-2 sm:gap-x-5 sm:gap-y-8 md:grid-cols-3 lg:grid-cols-4";

export function ProductGrid({ products, className }: { products: Card[]; className?: string }) {
  return (
    <ul className={cn(GRID, className)}>
      {products.map((p) => (
        <li key={p.id}>
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
          <div className="aspect-[3/4] animate-pulse rounded-[12px] bg-border/70" />
          <div className="h-4 w-3/4 animate-pulse rounded bg-border/70" />
          <div className="h-4 w-1/2 animate-pulse rounded bg-border/70" />
        </div>
      ))}
    </div>
  );
}
