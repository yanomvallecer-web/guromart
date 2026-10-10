import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { notFound } from "next/navigation";
import { CreditCard, Download, FileText, LifeBuoy, ShieldCheck, Star, UserRound } from "lucide-react";
import { PreviewGallery } from "@/components/catalog/preview-gallery";
import { ShareButton } from "@/components/catalog/share-button";
import { BuyPanel } from "@/components/commerce/buy-panel";
import { Skeleton } from "@/components/ui/card";
import { BackToResults } from "@/components/catalog/back-to-results";
import { displayTitle, gradeSummary, lengthLabel, shopSummary, typeName } from "@/lib/catalog/labels";
import { getCatalogFacets } from "@/lib/catalog/queries";
import { getStorefront } from "@/lib/catalog/storefront";
import { getPublishedProduct } from "@/lib/catalog/product";
import { formatPrice } from "@/lib/format";
import { paymentMethodsSentence, paymentMethodsShort, paymentsReady } from "@/lib/payments/paymongo";
import { publicObjectUrl } from "@/lib/storage";

const LICENSE: Record<string, string> = {
  single_teacher: "One teacher, for use with their own classes",
  multiple_teachers: "Several teachers in the same school",
  school_site: "Everyone at one school",
};

const count = new Intl.NumberFormat("en-PH");
const dateFmt = new Intl.DateTimeFormat("en-PH", { dateStyle: "long", timeZone: "Asia/Manila" });

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
  const payable = !free && paymentsReady();
  const title = displayTitle(product);
  const type = typeName(product.category_code, product.category);
  const grades = gradeSummary(product.grades);
  const kicker = [grades, product.subject, type].filter(Boolean).join(" · ");
  const formats = product.file_formats.map((f) => f.toUpperCase()).join(", ");
  const length = lengthLabel(product.page_count, product.category_code, product.file_formats);
  const fileWord = product.file_formats.length > 1 ? "files" : "file";

  // Every row comes from the listing's own fields and only appears when the seller filled it in.
  const details: { label: string; value: React.ReactNode }[] = [];
  if (formats) details.push({ label: "File format", value: `${formats}${product.is_editable ? " · Editable" : " · Not editable"}` });
  if (length) details.push({ label: "Length", value: length });
  if (grades) details.push({ label: product.grades.length > 1 ? "Grades" : "Grade", value: product.grades.join(", ") });
  if (product.subject) details.push({ label: "Subject", value: product.subject });
  if (type) details.push({ label: "Resource type", value: product.category ?? type });
  if (product.curriculum) details.push({ label: "Curriculum", value: product.curriculum });
  if (product.period || product.period_detail) details.push({ label: "Academic period", value: [product.period, product.period_detail].filter(Boolean).join(" · ") });
  if (product.language) details.push({ label: "Language", value: product.language });
  details.push({ label: "License", value: LICENSE[product.license_type] });
  if (product.published_at) details.push({ label: "Listed", value: dateFmt.format(new Date(product.published_at)) });

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
    // Phones get one column in reading order (title, previews, buy, delivery, details, description);
    // from lg the left and right columns come back. `contents` lets one markup do both.
    <article className="flex flex-col gap-5 lg:grid lg:grid-cols-[3fr_2fr] lg:items-start lg:gap-8">
      <div className="contents lg:flex lg:flex-col lg:gap-6">
        <section aria-label="Previews" className="order-2 flex flex-col gap-2">
          {product.previews.length ? (
            <>
              <PreviewGallery
                images={product.previews.map((p, i) => ({
                  src: publicObjectUrl("product-previews", p.storage_path),
                  alt: p.alt_text ?? `Preview ${i + 1} of ${product.title}`,
                }))}
              />
              <p className="text-sm text-muted-foreground">
                {product.previews.length === 1
                  ? "The seller added one preview image. "
                  : `${product.previews.length} preview images from the seller. `}
                {length ? `The full resource is ${length}.` : null}
              </p>
            </>
          ) : (
            <div className="flex aspect-[4/3] flex-col items-center justify-center gap-2 rounded-[12px] border border-border bg-primary-soft p-6 text-center">
              <FileText className="size-12 text-primary/60" aria-hidden />
              <p className="font-display text-xl font-bold">{title}</p>
              <p className="text-sm text-muted-foreground">The seller hasn&apos;t added preview images yet.</p>
            </div>
          )}
        </section>

        <section className="order-6 flex flex-col gap-3">
          <h2 className="font-display text-xl font-bold">About this resource</h2>
          <p className="whitespace-pre-line text-[15px] leading-relaxed">{product.description || product.summary}</p>
          {product.learning_competency ? (
            <div className="rounded-[12px] border border-border bg-surface p-4">
              <h3 className="text-sm font-semibold text-muted-foreground">Learning competency</h3>
              <p className="mt-1 whitespace-pre-line text-[15px]">{product.learning_competency}</p>
            </div>
          ) : null}
        </section>

        <section aria-labelledby="details-h" className="order-7 flex flex-col gap-3">
          <h2 id="details-h" className="font-display text-xl font-bold">Details</h2>
          <dl className="divide-y divide-border rounded-[12px] border border-border bg-surface text-[15px]">
            {details.map((d) => (
              <div key={d.label} className="grid grid-cols-[minmax(7rem,35%)_1fr] gap-3 px-4 py-2.5">
                <dt className="text-muted-foreground">{d.label}</dt>
                <dd className="min-w-0 break-words">{d.value}</dd>
              </div>
            ))}
          </dl>
          {product.license_terms ? <p className="whitespace-pre-line text-sm text-muted-foreground">{product.license_terms}</p> : null}
        </section>
      </div>

      <aside className="contents lg:flex lg:flex-col lg:gap-4">
        <header className="order-1 flex flex-col gap-1">
          <div className="flex items-center justify-between gap-3">
            <BackToResults />
            <ShareButton title={product.title} />
          </div>
          {kicker ? <p className="text-sm font-semibold text-muted-foreground">{kicker}</p> : null}
          <h1 className="font-display text-[26px] font-bold leading-tight sm:text-3xl">{title}</h1>
          {title !== product.title ? <p className="text-[15px] text-muted-foreground">{product.title}</p> : null}
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
            {payable ? <p data-web-checkout className="mt-1 text-xs text-muted-foreground">{paymentMethodsShort()}</p> : null}
          </div>
          <div className="min-w-0 flex-1 md:flex-none">
            <Suspense fallback={<Skeleton className="h-12 w-full" />}>
              <BuyPanel productId={product.id} slug={product.slug} free={free} />
            </Suspense>
          </div>
        </div>

        <section aria-labelledby="delivery-h" className="order-4 flex flex-col gap-2 rounded-[12px] border border-border bg-surface p-4 text-sm">
          <h2 id="delivery-h" className="font-semibold">What you get</h2>
          <ul className="flex flex-col gap-2">
            <li className="flex gap-2">
              <Download className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden />
              <span>
                {formats ? `The full ${formats} ${fileWord}` : "The full resource"}
                {length ? ` (${length})` : ""}, saved to <strong className="font-semibold">My Library</strong>. Download it again any time, on any device
                you sign in on.
              </span>
            </li>
            {free ? (
              <li className="flex gap-2">
                <UserRound className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden />
                <span>Free with a GuroMart account. Sign-in needs no password: we email you a 6-digit code.</span>
              </li>
            ) : (
              <li className="flex gap-2" data-web-checkout>
                <CreditCard className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden />
                <span>
                  {payable
                    ? `Pay once with ${paymentMethodsSentence()} through PayMongo. The download unlocks as soon as PayMongo confirms your payment.`
                    : "Online payment is paused right now, so this resource can't be bought at the moment."}
                </span>
              </li>
            )}
            <li className="flex gap-2">
              <LifeBuoy className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden />
              <span>
                {free ? null : (
                  <>
                    File broken or not as described? Ask within 7 days under our <Link href="/refunds" className="font-semibold text-primary hover:underline">refund policy</Link>.{" "}
                  </>
                )}
                Questions? <Link href="/contact" className="font-semibold text-primary hover:underline">Contact us</Link>.
              </span>
            </li>
          </ul>
        </section>

        <section aria-labelledby="checked-h" className="order-5 flex gap-3 rounded-[12px] bg-primary-soft p-4 text-sm">
          <ShieldCheck className="mt-0.5 size-5 shrink-0 text-primary" aria-hidden />
          <div>
            <h2 id="checked-h" className="font-semibold">Checked before listing</h2>
            <p className="mt-1">
              A GuroMart reviewer opened every file before this went live, to check that it opens, matches this description, and doesn&apos;t copy
              DepEd modules, textbooks or other sellers&apos; work. The review doesn&apos;t grade teaching quality or confirm curriculum alignment.
            </p>
          </div>
        </section>

        {product.storefront ? (
          <Suspense fallback={null}>
            <SellerCard slug={product.storefront.slug} name={product.storefront.name} />
          </Suspense>
        ) : null}
      </aside>
    </article>
  );
}

/** The shop behind the resource, described by what it actually publishes. */
async function SellerCard({ slug, name }: { slug: string; name: string }) {
  const [store, facets] = await Promise.all([getStorefront(slug), getCatalogFacets()]);
  const shop = facets.shops[slug];
  return (
    <section aria-labelledby="seller-h" className="order-8 flex flex-col gap-1 rounded-[12px] border border-border bg-surface p-4 text-sm">
      <h2 id="seller-h" className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Sold by</h2>
      <Link href={`/shop/${slug}`} className="font-display text-lg font-bold text-primary hover:underline">{name}</Link>
      {store?.tagline ? <p>{store.tagline}</p> : null}
      {shop ? <p className="text-muted-foreground">Publishes: {shopSummary(shop)}</p> : null}
    </section>
  );
}
