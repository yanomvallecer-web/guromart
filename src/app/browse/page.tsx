import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { SearchX, X } from "lucide-react";
import { FilterSheet } from "@/components/catalog/filter-sheet";
import { ProductGrid, ProductGridSkeleton } from "@/components/catalog/product-card";
import { SortMenu } from "@/components/catalog/sort-menu";
import { Button, buttonVariants } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/card";
import { ChipGroup, ChoiceChip } from "@/components/ui/chip";
import { Label, NativeSelect } from "@/components/ui/form";
import { shortGradeLabel } from "@/lib/catalog/labels";
import { type Facet, type Taxonomy, browseProducts, countProducts, getCatalogFacets, getShelf, getTaxonomy } from "@/lib/catalog/queries";
import { CONTACT_EMAIL } from "@/lib/site";
import { type BrowseParams, type FilterKey, activeFilters, browseHref, effectiveSort, parseBrowseParams } from "@/lib/catalog/search-params";

export const metadata: Metadata = { title: "Browse teaching resources" };

const PRICES = [
  { value: "free", label: "Free" },
  { value: "under-100", label: "Under ₱100" },
  { value: "100-200", label: "₱100 to ₱200" },
  { value: "over-200", label: "Over ₱200" },
];
const FORMATS = ["pdf", "docx", "pptx", "xlsx", "zip"].map((f) => ({ value: f, label: f.toUpperCase() }));
const SORT_LABEL: Record<string, string> = {
  relevance: "Most relevant",
  newest: "Newest",
  popular: "Most popular",
  rating: "Highest rated",
  price_asc: "Price: low to high",
  price_desc: "Price: high to low",
};

export default function BrowsePage({ searchParams }: PageProps<"/browse">) {
  return (
    <div className="mx-auto max-w-[1200px] px-4 py-4 sm:px-6 sm:py-8">
      <Suspense fallback={<BrowseSkeleton />}>
        <Browse searchParams={searchParams} />
      </Suspense>
    </div>
  );
}

function BrowseSkeleton() {
  return (
    <div className="grid gap-8 lg:grid-cols-[260px_1fr]">
      <div className="hidden h-96 animate-pulse rounded-[12px] bg-border/50 lg:block" />
      <div className="flex flex-col gap-4">
        <div className="h-11 w-32 animate-pulse rounded-full bg-border/50 lg:hidden" />
        <ProductGridSkeleton count={8} className="lg:grid-cols-3" />
      </div>
    </div>
  );
}

type Option = { value: string; label: string };
const opts = (items: { code: string; name: string }[]): Option[] => items.map((i) => ({ value: i.code, label: i.name }));

/** Display name of an applied filter, from the same lists the filters offer. */
function filterLabel(key: FilterKey, value: string, t: Taxonomy): string {
  const find = (items: { code: string; name: string }[]) => items.find((i) => i.code === value)?.name ?? value;
  switch (key) {
    case "category":
      return find(t.categories);
    case "grade":
      return find(t.grades);
    case "subject":
      return find(t.subjects);
    case "curriculum":
      return find(t.curricula);
    case "period":
      return find(t.periods);
    case "language":
      return find(t.languages);
    case "format":
      return value.toUpperCase();
    case "price":
      return PRICES.find((p) => p.value === value)?.label ?? value;
    case "shop":
      return `Shop: ${value}`;
  }
}

async function Browse({ searchParams }: { searchParams: PageProps<"/browse">["searchParams"] }) {
  const params = parseBrowseParams(await searchParams);
  const [taxonomy, result, facets] = await Promise.all([getTaxonomy(), browseProducts(params), getCatalogFacets()]);
  const sort = effectiveSort(params);
  const active = activeFilters(params);
  const clearHref = params.q ? `/browse?q=${encodeURIComponent(params.q)}` : "/browse";
  const sortOptions = [...(params.q ? ["relevance"] : []), "newest", "popular", "rating", "price_asc", "price_desc"].map((s) => ({
    label: SORT_LABEL[s],
    href: browseHref(params, { sort: s }),
    active: s === sort,
  }));
  // Kept when filters change: the search words, the shop being browsed and the sort order.
  const carried = (["q", "shop", "sort"] as const).map((k) =>
    params[k] ? <input key={k} type="hidden" name={k} value={String(params[k])} /> : null,
  );

  const select = (prefix: string, name: keyof BrowseParams, label: string, options: Option[], counted?: Facet[]) => {
    // With counts, options that have live resources come first and the rest are grouped below.
    const count = new Map(counted?.map((f) => [f.code, f.count]));
    const withCount = (o: Option) => (counted ? `${o.label} (${count.get(o.value) ?? 0})` : o.label);
    const has = counted ? options.filter((o) => (count.get(o.value) ?? 0) > 0) : options;
    const none = counted ? options.filter((o) => !count.get(o.value)) : [];
    return (
      <div className="flex flex-col gap-1.5">
        <Label htmlFor={`${prefix}-${name}`}>{label}</Label>
        <NativeSelect id={`${prefix}-${name}`} name={name} defaultValue={(params[name] as string | undefined) ?? ""}>
          <option value="">Any</option>
          {has.map((o) => (
            <option key={o.value} value={o.value}>{withCount(o)}</option>
          ))}
          {none.length ? (
            <optgroup label="No resources yet">
              {none.map((o) => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </optgroup>
          ) : null}
        </NativeSelect>
      </div>
    );
  };
  const chips = (name: keyof BrowseParams, legend: string, options: { value: string; label: React.ReactNode; name?: string }[], counted?: Facet[]) => {
    const count = new Map(counted?.map((f) => [f.code, f.count]));
    const has = counted ? options.filter((o) => (count.get(o.value) ?? 0) > 0) : options;
    const none = counted ? options.filter((o) => !count.get(o.value)) : [];
    const chip = (o: (typeof options)[number]) => {
      const c = count.get(o.value);
      return (
        <ChoiceChip key={o.value} name={name} value={o.value} defaultChecked={params[name] === o.value}>
          {o.label}
          {c ? " " : null}
          {c ? (
            <span className=" rounded-full bg-primary-soft px-1.5 text-xs font-bold text-primary">
              {c}
              <span className="sr-only">{c === 1 ? " resource" : " resources"}</span>
            </span>
          ) : null}
        </ChoiceChip>
      );
    };
    return (
      <ChipGroup legend={legend}>
        <ChoiceChip name={name} value="" defaultChecked={!params[name]}>Any</ChoiceChip>
        {has.map(chip)}
        {none.length ? (
          <details open={none.some((o) => o.value === params[name])} className="w-full">
            <summary className="flex min-h-11 cursor-pointer items-center text-sm font-semibold text-primary">
              {none.length} more with no resources yet
            </summary>
            <div className="flex flex-wrap gap-2 pt-1">{none.map(chip)}</div>
          </details>
        ) : null}
      </ChipGroup>
    );
  };
  const moreActive = Boolean(params.period || params.curriculum || params.language || params.format);

  return (
    <div className="grid gap-8 lg:grid-cols-[260px_1fr]">
      {/* Desktop: the filter sidebar. */}
      <aside className="hidden lg:block">
        <form action="/browse" className="flex flex-col gap-4 rounded-[12px] border border-border bg-surface p-4">
          <h2 className="font-display text-lg font-bold">Filters</h2>
          {carried}
          {select("f", "grade", "Grade level", opts(taxonomy.grades), facets.grades)}
          {select("f", "subject", "Subject", opts(taxonomy.subjects), facets.subjects)}
          {select("f", "category", "Resource type", opts(taxonomy.categories), facets.categories)}
          {select("f", "curriculum", "Curriculum", opts(taxonomy.curricula))}
          {select("f", "period", "Academic period", opts(taxonomy.periods))}
          {select("f", "language", "Language", opts(taxonomy.languages))}
          {select("f", "format", "File format", FORMATS)}
          {select("f", "price", "Price", PRICES)}
          <Button type="submit">Apply filters</Button>
          {active.length ? (
            <Link href={clearHref} className="flex min-h-11 items-center justify-center text-sm font-semibold text-primary hover:underline">
              Clear all filters
            </Link>
          ) : null}
        </form>
      </aside>

      <section aria-labelledby="results-h" className="flex min-w-0 flex-col gap-4 sm:gap-6">
        {/* Phones and tablets: the Filters button, then the filters in use as removable chips. */}
        <div className="-mx-4 flex items-center gap-2 overflow-x-auto px-4 pb-1 sm:mx-0 sm:flex-wrap sm:overflow-visible sm:px-0 lg:pb-0">
          <FilterSheet key={browseHref(params, {})} activeCount={active.length} total={result.total} clearHref={clearHref}>
            {carried}
            {chips(
              "grade",
              "Grade level",
              taxonomy.grades.map((g) => ({
                value: g.code,
                label: (
                  <>
                    <span aria-hidden>{shortGradeLabel(g.name)}</span>
                    <span className="sr-only">{g.name}</span>
                  </>
                ),
              })),
              facets.grades,
            )}
            {chips("subject", "Subject", opts(taxonomy.subjects), facets.subjects)}
            {chips("category", "Resource type", opts(taxonomy.categories), facets.categories)}
            {chips("price", "Price", PRICES)}
            <details open={moreActive} className="group rounded-[12px] border border-border">
              <summary className="flex min-h-11 cursor-pointer list-none items-center px-4 text-sm font-semibold text-primary [&::-webkit-details-marker]:hidden">
                More filters: quarter, curriculum, language, file type
              </summary>
              <div className="flex flex-col gap-4 border-t border-border p-4">
                {select("m", "period", "Quarter or period", opts(taxonomy.periods))}
                {select("m", "curriculum", "Curriculum", opts(taxonomy.curricula))}
                {select("m", "language", "Language", opts(taxonomy.languages))}
                {select("m", "format", "File type", FORMATS)}
              </div>
            </details>
          </FilterSheet>
          {active.length || params.q ? (
            <ul aria-label="Filters in use" className="flex shrink-0 items-center gap-2 sm:flex-wrap">
              {params.q ? (
                <li>
                  <Link
                    href={browseHref(params, { q: null, sort: params.sort === "relevance" ? null : (params.sort ?? null) })}
                    aria-label={`Remove search: ${params.q}`}
                    className="flex min-h-11 items-center gap-1.5 whitespace-nowrap rounded-full border border-primary bg-surface px-4 text-sm font-semibold text-primary hover:bg-primary-soft"
                  >
                    &ldquo;{params.q}&rdquo; <X className="size-4" aria-hidden />
                  </Link>
                </li>
              ) : null}
              {active.map((f) => {
                const label = filterLabel(f.key, f.value, taxonomy);
                return (
                  <li key={f.key}>
                    <Link
                      href={browseHref(params, { [f.key]: null })}
                      aria-label={`Remove filter: ${label}`}
                      className="flex min-h-11 items-center gap-1.5 whitespace-nowrap rounded-full border border-primary bg-surface px-4 text-sm font-semibold text-primary hover:bg-primary-soft"
                    >
                      {label} <X className="size-4" aria-hidden />
                    </Link>
                  </li>
                );
              })}
              {active.length > 0 ? (
                <li>
                  <Link href={clearHref} className="flex min-h-11 items-center whitespace-nowrap px-2 text-sm font-semibold text-primary hover:underline">
                    Clear filters
                  </Link>
                </li>
              ) : null}
            </ul>
          ) : null}
        </div>

        <div className="flex flex-col gap-1 sm:flex-row sm:flex-wrap sm:items-baseline sm:justify-between sm:gap-2">
          <h1 id="results-h" className="font-display text-2xl font-bold">
            {params.q ? <>Results for &ldquo;{params.q}&rdquo;</> : "All teaching resources"}
          </h1>
          <div className="flex items-center justify-between gap-2 sm:justify-end">
            <p className="text-sm text-muted-foreground" aria-live="polite" data-testid="result-count">
              {result.total} {result.total === 1 ? "resource" : "resources"}
            </p>
            <SortMenu current={SORT_LABEL[sort]} options={sortOptions} />
          </div>
        </div>
        {result.items.length === 0 ? (
          <NoResults params={params} taxonomy={taxonomy} total={facets.total} />
        ) : (
          <ProductGrid products={result.items} className="lg:grid-cols-3" />
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

/**
 * No matches: say which single change would bring results back (each count
 * comes from the same search), offer the whole catalog, and show the newest
 * resources so the page is never a dead end.
 */
async function NoResults({ params, taxonomy, total }: { params: BrowseParams; taxonomy: Taxonomy; total: number }) {
  const changes = [
    ...(params.q ? [{ label: `Search all resources, not just “${params.q}”`, change: { q: null } as const, without: { ...params, q: undefined } }] : []),
    ...activeFilters(params).map((f) => ({
      label: `Remove “${filterLabel(f.key, f.value, taxonomy)}”`,
      change: { [f.key]: null },
      without: { ...params, [f.key]: undefined },
    })),
  ];
  const [counts, latest] = await Promise.all([Promise.all(changes.map((c) => countProducts(c.without))), getShelf("new", 4)]);
  const helpful = changes.map((c, i) => ({ ...c, count: counts[i] })).filter((c) => c.count > 0);
  const subject = encodeURIComponent("Resource request");
  const body = encodeURIComponent(`I'm looking for: ${params.q ?? ""}\nGrade and subject: \n`);
  return (
    <div className="flex flex-col gap-8">
      <EmptyState icon={<SearchX />} title="No resources match yet">
        GuroMart is new, so many grades and subjects don&apos;t have resources yet.
        {helpful.length ? " One of these changes will show results:" : ""}
      </EmptyState>
      <ul className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:justify-center">
        {helpful.map((c) => (
          <li key={c.label}>
            <Link href={browseHref(params, c.change)} className={buttonVariants({ variant: "outline", className: "h-auto min-h-11 w-full whitespace-normal py-2 text-left" })}>
              {c.label}: {c.count} {c.count === 1 ? "resource" : "resources"}
            </Link>
          </li>
        ))}
        {total > 0 && !helpful.length ? (
          <li>
            <Link href="/browse" className={buttonVariants({ variant: "outline", className: "w-full" })}>
              Browse all {total} {total === 1 ? "resource" : "resources"}
            </Link>
          </li>
        ) : null}
      </ul>
      <p className="text-center text-sm text-muted-foreground">
        Can&apos;t find what you need?{" "}
        <a href={`mailto:${CONTACT_EMAIL}?subject=${subject}&body=${body}`} className="font-semibold text-primary hover:underline">
          Email us what you&apos;re looking for
        </a>
        . It shows us what teachers need most. Made something like it?{" "}
        <Link href="/sell" className="font-semibold text-primary hover:underline">Sell it on GuroMart</Link>.
      </p>
      {latest.length ? (
        <section aria-labelledby="latest-h" className="flex flex-col gap-4">
          <h2 id="latest-h" className="font-display text-xl font-bold">Newest resources</h2>
          <ProductGrid products={latest} className="lg:grid-cols-4" />
        </section>
      ) : null}
    </div>
  );
}
