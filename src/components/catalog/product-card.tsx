import Link from "next/link";
import { FileText, Star } from "lucide-react";
import type { ProductCard as Card } from "@/lib/catalog/queries";
import { formatPrice } from "@/lib/format";
import { publicObjectUrl } from "@/lib/storage";

export function ProductCard({ product }: { product: Card }) {
  return (
    <Link href={`/resources/${product.slug}`} className="group flex flex-col gap-2 text-foreground no-underline">
      <div className="aspect-[4/3] overflow-hidden rounded-[12px] border border-border bg-accent-soft">
        {product.preview_path ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={publicObjectUrl("product-previews", product.preview_path)}
            alt=""
            loading="lazy"
            className="size-full object-cover transition-transform group-hover:scale-[1.02]"
          />
        ) : (
          <div className="flex size-full items-center justify-center text-primary/50">
            <FileText className="size-10" aria-hidden />
          </div>
        )}
      </div>
      <div className="flex flex-col gap-0.5">
        <p className="text-xs font-semibold text-muted-foreground">
          {[product.category, product.subject].filter(Boolean).join(" · ")}
        </p>
        <h3 className="line-clamp-2 text-[15px] font-bold leading-snug group-hover:text-primary">{product.title}</h3>
        {product.storefront ? <p className="truncate text-sm text-muted-foreground">{product.storefront.name}</p> : null}
        <div className="mt-1 flex items-center justify-between">
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

export function ProductGrid({ products }: { products: Card[] }) {
  return (
    <ul className="grid grid-cols-1 gap-x-5 gap-y-8 min-[480px]:grid-cols-2 md:grid-cols-3 lg:grid-cols-4">
      {products.map((p) => (
        <li key={p.id}>
          <ProductCard product={p} />
        </li>
      ))}
    </ul>
  );
}

export function ProductGridSkeleton({ count = 4 }: { count?: number }) {
  return (
    <div className="grid grid-cols-1 gap-5 min-[480px]:grid-cols-2 md:grid-cols-3 lg:grid-cols-4" aria-hidden>
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
