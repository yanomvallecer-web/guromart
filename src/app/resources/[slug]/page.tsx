import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { notFound } from "next/navigation";
import { FileText } from "lucide-react";
import { BuyPanel } from "@/components/commerce/buy-panel";
import { Badge, Card, Skeleton } from "@/components/ui/card";
import { getPublishedProduct } from "@/lib/catalog/product";
import { formatPrice } from "@/lib/format";
import { publicObjectUrl } from "@/lib/storage";

const LICENSE: Record<string, string> = {
  single_teacher: "One teacher, for use with their own classes",
  multiple_teachers: "Several teachers in the same school",
  school_site: "Everyone at one school",
};

export async function generateMetadata({ params }: PageProps<"/resources/[slug]">): Promise<Metadata> {
  const product = await getPublishedProduct((await params).slug);
  return product ? { title: product.title, description: product.summary ?? undefined } : { title: "Resource not found" };
}

export default function ResourcePage({ params }: PageProps<"/resources/[slug]">) {
  return (
    <div className="mx-auto max-w-[1200px] px-4 py-8 sm:px-6">
      <Suspense fallback={<div className="h-96 animate-pulse rounded-[12px] bg-border/50" />}>
        <Resource params={params} />
      </Suspense>
    </div>
  );
}

async function Resource({ params }: { params: PageProps<"/resources/[slug]">["params"] }) {
  const product = await getPublishedProduct((await params).slug);
  if (!product) notFound();

  const facts: [string, string | null][] = [
    ["Resource type", product.category],
    ["Grade level", product.grades.join(", ") || null],
    ["Subject", product.subject],
    ["Curriculum", product.curriculum],
    ["Academic period", [product.period, product.period_detail].filter(Boolean).join(" · ") || null],
    ["Language", product.language],
    ["Files", product.file_formats.map((f) => f.toUpperCase()).join(", ") || null],
    ["Pages or slides", product.page_count ? String(product.page_count) : null],
    ["Editable", product.is_editable ? "Yes" : "No"],
  ];

  return (
    <article className="grid gap-8 lg:grid-cols-[3fr_2fr]">
      <div className="flex flex-col gap-4">
        {product.previews.length ? (
          <ul className="grid gap-3 sm:grid-cols-2">
            {product.previews.map((p, i) => (
              <li key={p.storage_path} className={i === 0 ? "sm:col-span-2" : undefined}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={publicObjectUrl("product-previews", p.storage_path)} alt={p.alt_text ?? `Preview ${i + 1} of ${product.title}`} className="w-full rounded-[12px] border border-border bg-surface" />
              </li>
            ))}
          </ul>
        ) : (
          <div className="flex aspect-[4/3] items-center justify-center rounded-[12px] border border-border bg-accent-soft text-primary/50">
            <FileText className="size-16" aria-hidden />
            <span className="sr-only">No preview available</span>
          </div>
        )}
        <section className="flex flex-col gap-2">
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

      <aside className="flex flex-col gap-4">
        <div>
          {product.category ? <Badge>{product.category}</Badge> : null}
          <h1 className="mt-2 font-display text-3xl font-bold leading-tight">{product.title}</h1>
          {product.storefront ? (
            <p className="mt-1 text-muted-foreground">
              by <Link href={`/shop/${product.storefront.slug}`} className="font-semibold text-primary hover:underline">{product.storefront.name}</Link>
            </p>
          ) : null}
        </div>
        <Card className="flex flex-col gap-3 p-5">
          <p className={product.price_centavos === 0 ? "font-display text-3xl font-bold text-success" : "font-display text-3xl font-bold"}>
            {formatPrice(product.price_centavos)}
          </p>
          <Suspense fallback={<Skeleton className="h-12 w-full" />}>
            <BuyPanel productId={product.id} slug={product.slug} free={product.price_centavos === 0} />
          </Suspense>
        </Card>
        <Card className="p-5">
          <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 text-sm">
            {facts.filter(([, v]) => v).map(([k, v]) => (
              <div key={k} className="contents">
                <dt className="text-muted-foreground">{k}</dt>
                <dd className="font-medium">{v}</dd>
              </div>
            ))}
          </dl>
        </Card>
        <Card className="p-5 text-sm">
          <h2 className="mb-1 font-semibold">License</h2>
          <p>{LICENSE[product.license_type]}</p>
          {product.license_terms ? <p className="mt-2 whitespace-pre-line text-muted-foreground">{product.license_terms}</p> : null}
        </Card>
      </aside>
    </article>
  );
}
