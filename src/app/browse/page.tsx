import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { SearchX } from "lucide-react";
import { ProductGrid, ProductGridSkeleton } from "@/components/catalog/product-card";
import { Button, buttonVariants } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/card";
import { Label, NativeSelect } from "@/components/ui/form";
import { browseProducts, getTaxonomy } from "@/lib/catalog/queries";
import { type BrowseParams, browseHref, effectiveSort, parseBrowseParams } from "@/lib/catalog/search-params";

export const metadata: Metadata = { title: "Browse teaching resources" };

export default function BrowsePage({ searchParams }: PageProps<"/browse">) {
  return (
    <div className="mx-auto max-w-[1200px] px-4 py-8 sm:px-6">
      <Suspense fallback={<BrowseSkeleton />}>
        <Browse searchParams={searchParams} />
      </Suspense>
    </div>
  );
}

function BrowseSkeleton() {
  return (
    <div className="grid gap-8 lg:grid-cols-[260px_1fr]">
      <div className="h-96 animate-pulse rounded-[12px] bg-border/50" />
      <ProductGridSkeleton count={8} />
    </div>
  );
}

async function Browse({ searchParams }: { searchParams: PageProps<"/browse">["searchParams"] }) {
  const params = parseBrowseParams(await searchParams);
  const [taxonomy, result] = await Promise.all([getTaxonomy(), browseProducts(params)]);
  const sort = effectiveSort(params);

  const select = (name: keyof BrowseParams, label: string, options: { value: string; label: string }[]) => (
    <div className="flex flex-col gap-1.5">
      <Label htmlFor={`f-${name}`}>{label}</Label>
      <NativeSelect id={`f-${name}`} name={name} defaultValue={(params[name] as string | undefined) ?? ""}>
        <option value="">Any</option>
        {options.map((o) => (
          <option key={o.value} value={o.value}>{o.label}</option>
        ))}
      </NativeSelect>
    </div>
  );
  const opts = (items: { code: string; name: string }[]) => items.map((i) => ({ value: i.code, label: i.name }));

  return (
    <div className="grid gap-8 lg:grid-cols-[260px_1fr]">
      <aside>
        <form action="/browse" className="flex flex-col gap-4 rounded-[12px] border border-border bg-surface p-4">
          <h2 className="font-display text-lg font-bold">Filters</h2>
          {params.q ? <input type="hidden" name="q" value={params.q} /> : null}
          {select("category", "Resource type", opts(taxonomy.categories))}
          {select("grade", "Grade level", opts(taxonomy.grades))}
          {select("subject", "Subject", opts(taxonomy.subjects))}
          {select("curriculum", "Curriculum", opts(taxonomy.curricula))}
          {select("period", "Academic period", opts(taxonomy.periods))}
          {select("language", "Language", taxonomy.languages.map((l) => ({ value: l.code, label: l.name })))}
          {select("format", "File format", ["pdf", "docx", "pptx", "xlsx", "zip"].map((f) => ({ value: f, label: f.toUpperCase() })))}
          {select("price", "Price", [
            { value: "free", label: "Free" },
            { value: "under-100", label: "Under ₱100" },
            { value: "100-200", label: "₱100 to ₱200" },
            { value: "over-200", label: "Over ₱200" },
          ])}
          {select("sort", "Sort by", [
            ...(params.q ? [{ value: "relevance", label: "Most relevant" }] : []),
            { value: "newest", label: "Newest" },
            { value: "popular", label: "Most popular" },
            { value: "rating", label: "Highest rated" },
            { value: "price_asc", label: "Price: low to high" },
            { value: "price_desc", label: "Price: high to low" },
          ])}
          <Button type="submit">Apply filters</Button>
          <Link href={params.q ? `/browse?q=${encodeURIComponent(params.q)}` : "/browse"} className="text-center text-sm font-semibold text-primary hover:underline">
            Clear filters
          </Link>
        </form>
      </aside>

      <section aria-labelledby="results-h" className="flex flex-col gap-6">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h1 id="results-h" className="font-display text-2xl font-bold">
            {params.q ? <>Results for &ldquo;{params.q}&rdquo;</> : "All teaching resources"}
          </h1>
          <p className="text-sm text-muted-foreground" aria-live="polite">
            {result.total} {result.total === 1 ? "resource" : "resources"} · sorted by {sort.replace("_", " ")}
          </p>
        </div>
        {result.items.length === 0 ? (
          <EmptyState icon={<SearchX />} title="No resources match yet">
            Try fewer filters or a different word. New resources are added as teacher shops publish them.
          </EmptyState>
        ) : (
          <ProductGrid products={result.items} />
        )}
        {result.pageCount > 1 ? (
          <nav aria-label="Pages" className="flex items-center justify-center gap-3">
            {result.page > 1 ? (
              <Link href={browseHref(params, { page: result.page - 1 })} className={buttonVariants({ variant: "outline" })}>Previous</Link>
            ) : null}
            <span className="text-sm text-muted-foreground">Page {result.page} of {result.pageCount}</span>
            {result.page < result.pageCount ? (
              <Link href={browseHref(params, { page: result.page + 1 })} className={buttonVariants({ variant: "outline" })}>Next</Link>
            ) : null}
          </nav>
        ) : null}
      </section>
    </div>
  );
}
