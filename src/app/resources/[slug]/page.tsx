import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { notFound } from "next/navigation";
import { FileText, Star } from "lucide-react";
import { ShareButton } from "@/components/catalog/share-button";
import { BuyPanel } from "@/components/commerce/buy-panel";
import { Card, Skeleton } from "@/components/ui/card";
import { getPublishedProduct } from "@/lib/catalog/product";
import { formatPrice } from "@/lib/format";
import { publicObjectUrl } from "@/lib/storage";

const LICENSE: Record<string, string> = {
  single_teacher: "One teacher, for use with their own classes",
  multiple_teachers: "Several teachers in the same school",
  school_site: "Everyone at one school",
};

const count = new Intl.NumberFormat("en-PH");

export async function generateMetadata({ params }: PageProps<"/resources/[slug]">): Promise<Metadata> {
  const product = await getPublishedProduct((await params).slug);
  return product ? { title: product.title, description: product.summary ?? undefined } : { title: "Resource not found" };
}

export default function ResourcePage({ params }: PageProps<"/resources/[slug]">) {
  return (
    <div className="mx-auto max-w-[1200px] px-4 py-4 sm:px-6 sm:py-8">
      <Suspense fallback={<div className="h-96 animate-pulse rounded-[12px] bg-border/50" />}>
        <Resource params={params} />
      </Suspense>
    </div>
  );
}

async function Resource({ params }: { params: PageProps<"/resources/[slug]">["params"] }) {
  const product = await getPublishedProduct((await params).slug);
  if (!product) notFound();

  const free = product.price_centavos === 0;
  const kicker = [product.category, product.subject, product.grades.join(", ")].filter(Boolean).join(" · ");
  const formats = product.file_formats.map((f) => f.toUpperCase()).join(", ");
  // Quick facts from the listing's own fields; a tile only appears when the seller filled it in.
  const tiles: { label: string; main: string; sub?: string }[] = [];
  if (formats) tiles.push({ label: "Files", main: formats, sub: product.is_editable ? "Editable" : undefined });
  if (product.page_count) tiles.push({ label: "Length", main: `${count.format(product.page_count)} ${product.page_count === 1 ? "page" : "pages"}`, sub: "or slides" });
  if (product.curriculum || product.period) {
    tiles.push({
      label: "Curriculum",
      main: product.curriculum ?? product.period!,
      sub: product.curriculum ? [product.period, product.period_detail].filter(Boolean).join(" · ") || undefined : product.period_detail ?? undefined,
    });
  }
  if (product.language) tiles.push({ label: "Language", main: product.language });

  const byline = [
    product.rating_count > 0 ? (
      <span key="rating" className="inline-flex items-center gap-1">
        <Star className="size-4 fill-accent text-accent" aria-hidden />
        {product.rating_avg.toFixed(1)} <span className="sr-only">out of 5 from</span>({count.format(product.rating_count)}
        <span className="sr-only"> ratings</span>)
      </span>
    ) : null,
    product.download_count > 0 ? (
      <span key="downloads">
        {count.format(product.download_count)} {product.download_count === 1 ? "download" : "downloads"}
      </span>
    ) : null,
  ].filter(Boolean);

  return (
    // Phones get one column in reading order (title, previews, buy, facts, description);
    // from lg the left and right columns come back. `contents` lets one markup do both.
    <article className="flex flex-col gap-5 lg:grid lg:grid-cols-[3fr_2fr] lg:items-start lg:gap-8">
      <div className="contents lg:flex lg:flex-col lg:gap-6">
        <section aria-label="Previews" className="order-2 flex flex-col gap-2">
          {product.previews.length ? (
            <ul
              tabIndex={0}
              aria-label={`${product.previews.length} preview ${product.previews.length === 1 ? "image" : "images"}, swipe to see more`}
              className="-mx-4 flex snap-x snap-mandatory gap-3 overflow-x-auto overscroll-x-contain scroll-px-4 px-4 pb-1 sm:mx-0 sm:scroll-px-0 sm:px-0 lg:grid lg:grid-cols-2 lg:overflow-visible lg:pb-0"
            >
              {product.previews.map((p, i) => (
                <li
                  key={p.storage_path}
                  className={`relative shrink-0 snap-start ${product.previews.length > 1 ? "w-[82%] sm:w-[48%]" : "w-full"} lg:w-auto ${i === 0 ? "lg:col-span-2" : ""}`}
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={publicObjectUrl("product-previews", p.storage_path)}
                    alt={p.alt_text ?? `Preview ${i + 1} of ${product.title}`}
                    loading={i === 0 ? "eager" : "lazy"}
                    className="aspect-[3/4] max-h-[60dvh] w-full rounded-[12px] border border-border bg-surface object-contain lg:aspect-auto lg:max-h-none"
                  />
                  {product.previews.length > 1 ? (
                    <span className="absolute left-2 top-2 rounded-full bg-surface/95 px-2.5 py-0.5 text-xs font-bold shadow-sm" aria-hidden>
                      Preview {i + 1} of {product.previews.length}
                    </span>
                  ) : null}
                </li>
              ))}
            </ul>
          ) : (
            <div className="flex aspect-[4/3] items-center justify-center rounded-[12px] border border-border bg-accent-soft text-primary/50">
              <FileText className="size-16" aria-hidden />
              <span className="sr-only">No preview available</span>
            </div>
          )}
        </section>

        <section className="order-5 flex flex-col gap-2">
          <h2 className="font-display text-xl font-bold">About this resource</h2>
          <p className="whitespace-pre-line text-[15px] leading-relaxed">{product.description || product.summary}</p>
          {product.learning_competency ? (
            <>
              <h3 className="mt-2 font-semibold">Learning competency</h3>
              <p className="whitespace-pre-line text-[15px]">{product.learning_competency}</p>
            </>
          ) : null}
        </section>
      </div>

      <aside className="contents lg:flex lg:flex-col lg:gap-4">
        <header className="order-1 flex flex-col gap-1">
          <div className="flex items-start justify-between gap-3">
            {kicker ? <p className="pt-1 text-sm font-semibold text-muted-foreground">{kicker}</p> : <span />}
            <ShareButton title={product.title} />
          </div>
          <h1 className="font-display text-[28px] font-bold leading-tight sm:text-3xl">{product.title}</h1>
          {product.storefront || byline.length ? (
            <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[15px] text-muted-foreground">
              {product.storefront ? (
                <span>
                  by <Link href={`/shop/${product.storefront.slug}`} className="font-semibold text-primary hover:underline">{product.storefront.name}</Link>
                </span>
              ) : null}
              {byline.map((b, i) => (
                <span key={i} className="inline-flex items-center gap-2">
                  {product.storefront || i > 0 ? <span aria-hidden>·</span> : null}
                  {b}
                </span>
              ))}
            </p>
          ) : null}
        </header>

        {/* The price and one action: a bar fixed to the bottom of phones, a card from md up. */}
        <div
          data-testid="buy-bar"
          className="order-3 fixed inset-x-0 bottom-0 z-30 flex min-h-[var(--bottom-bar)] items-center gap-3 border-t border-border bg-surface px-4 pt-2 pb-[calc(0.5rem+env(safe-area-inset-bottom))] shadow-[0_-4px_16px_rgb(21_35_63/0.08)] md:static md:z-auto md:flex-col md:items-stretch md:gap-3 md:rounded-[12px] md:border md:p-5 md:shadow-none"
        >
          <div className="shrink-0">
            <p className={`font-display text-2xl font-bold leading-none md:text-3xl ${free ? "text-success" : ""}`}>{formatPrice(product.price_centavos)}</p>
            {free ? null : <p className="mt-1 text-xs text-muted-foreground">GCash · Maya · Card</p>}
          </div>
          <div className="min-w-0 flex-1 md:flex-none">
            <Suspense fallback={<Skeleton className="h-12 w-full" />}>
              <BuyPanel productId={product.id} slug={product.slug} free={free} />
            </Suspense>
          </div>
        </div>

        {tiles.length ? (
          <dl className="order-4 grid grid-cols-[repeat(auto-fit,minmax(6.5rem,1fr))] gap-2">
            {tiles.map((t) => (
              <div key={t.label} className="flex flex-col items-center justify-center rounded-[12px] border border-border bg-surface px-2 py-3 text-center">
                <dt className="sr-only">{t.label}</dt>
                <dd className="text-[15px] font-bold leading-tight">{t.main}</dd>
                {t.sub ? <dd className="mt-0.5 text-sm text-muted-foreground">{t.sub}</dd> : null}
              </div>
            ))}
          </dl>
        ) : null}

        <Card className="order-6 p-5 text-sm">
          <h2 className="mb-1 font-semibold">License</h2>
          <p>{LICENSE[product.license_type]}</p>
          {product.license_terms ? <p className="mt-2 whitespace-pre-line text-muted-foreground">{product.license_terms}</p> : null}
        </Card>
      </aside>
    </article>
  );
}
