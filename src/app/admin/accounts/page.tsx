import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { Users } from "lucide-react";
import { PageShell, PanelSkeleton } from "@/components/layout/page-shell";
import { Card, EmptyState } from "@/components/ui/card";
import { requireArea } from "@/lib/auth/dal";
import { createAdminClient } from "@/lib/supabase/admin";
import { cn } from "@/lib/utils";

export const metadata: Metadata = { title: "Accounts", robots: { index: false } };

const PAGE_SIZE = 50;
const SHOWS = [
  { value: "all", label: "Everyone" },
  { value: "sellers", label: "Sellers" },
  { value: "buyers", label: "Not selling" },
] as const;
type Show = (typeof SHOWS)[number]["value"];

const SELLER_STATUS: Record<string, string> = {
  onboarding: "Setting up",
  active: "Active seller",
  suspended: "Suspended",
  closed: "Closed",
};

type SearchParams = Promise<{ show?: string; q?: string; page?: string }>;

export default function AccountsPage({ searchParams }: { searchParams: SearchParams }) {
  return (
    <PageShell
      title="Accounts"
      description="Everyone who has signed up, and which of them sell."
      actions={<Link href="/admin" className="text-sm font-semibold">Admin overview</Link>}
    >
      <Suspense fallback={<PanelSkeleton />}>
        <AccountList searchParams={searchParams} />
      </Suspense>
    </PageShell>
  );
}

const joined = new Intl.DateTimeFormat("en-PH", { dateStyle: "medium", timeZone: "Asia/Manila" });

type Account = {
  id: string;
  email: string;
  name: string;
  school: string | null;
  createdAt: string;
  lastSignIn: string | null;
  roles: string[];
  seller: { status: string; type: string; shop: { name: string; slug: string; published: boolean } | null } | null;
};

/** Auth users, at most 50 pages of 1,000; plenty for now, and the page says so if it runs out. */
async function listAuthUsers(admin: ReturnType<typeof createAdminClient>) {
  const users: { id: string; email?: string; created_at: string; last_sign_in_at?: string | null }[] = [];
  for (let page = 1; page <= 50; page++) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 1000 });
    if (error) throw new Error(`Could not load accounts: ${error.message}`);
    users.push(...data.users);
    if (data.users.length < 1000) return { users, complete: true };
  }
  return { users, complete: false };
}

async function AccountList({ searchParams }: { searchParams: SearchParams }) {
  await requireArea("admin", "/admin/accounts");
  const params = await searchParams;
  const show: Show = SHOWS.some((s) => s.value === params.show) ? (params.show as Show) : "all";
  const q = (params.q ?? "").trim().toLowerCase().slice(0, 100);
  const page = Math.max(1, Number.parseInt(params.page ?? "1", 10) || 1);

  // Signed in as an admin above; emails live in auth.users, which only the service role can read.
  const admin = createAdminClient();
  const [{ users, complete }, profiles, roles, sellers] = await Promise.all([
    listAuthUsers(admin),
    admin.from("profiles").select("id, display_name, school_name"),
    admin.from("user_roles").select("user_id, role"),
    admin.from("seller_accounts").select("user_id, status, seller_type, storefronts(name, slug, is_published)"),
  ]);
  for (const r of [profiles, roles, sellers]) if (r.error) throw new Error(`Could not load accounts: ${r.error.message}`);

  const profileOf = new Map((profiles.data ?? []).map((p) => [p.id as string, p]));
  const rolesOf = new Map<string, string[]>();
  for (const r of roles.data ?? []) rolesOf.set(r.user_id, [...(rolesOf.get(r.user_id) ?? []), r.role]);
  type SellerRow = { user_id: string; status: string; seller_type: string; storefronts: { name: string; slug: string; is_published: boolean } | { name: string; slug: string; is_published: boolean }[] | null };
  const sellerOf = new Map(
    ((sellers.data ?? []) as SellerRow[]).map((s) => {
      const shop = ([] as { name: string; slug: string; is_published: boolean }[]).concat(s.storefronts ?? [])[0];
      return [s.user_id, { status: s.status, type: s.seller_type, shop: shop ? { name: shop.name, slug: shop.slug, published: shop.is_published } : null }];
    }),
  );

  const all: Account[] = users
    .map((u) => ({
      id: u.id,
      email: u.email ?? "",
      name: profileOf.get(u.id)?.display_name || "",
      school: profileOf.get(u.id)?.school_name ?? null,
      createdAt: u.created_at,
      lastSignIn: u.last_sign_in_at ?? null,
      roles: rolesOf.get(u.id) ?? [],
      seller: sellerOf.get(u.id) ?? null,
    }))
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));

  const counts = { all: all.length, sellers: all.filter((a) => a.seller).length, buyers: all.filter((a) => !a.seller).length };
  const shown = all
    .filter((a) => (show === "sellers" ? a.seller : show === "buyers" ? !a.seller : true))
    .filter((a) => !q || [a.email, a.name, a.school ?? "", a.seller?.shop?.name ?? ""].some((v) => v.toLowerCase().includes(q)));
  const pages = Math.max(1, Math.ceil(shown.length / PAGE_SIZE));
  const rows = shown.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
  const link = (next: { show?: Show; page?: number }) => {
    const sp = new URLSearchParams();
    const s = next.show ?? show;
    if (s !== "all") sp.set("show", s);
    if (q) sp.set("q", q);
    if (next.page && next.page > 1) sp.set("page", String(next.page));
    const qs = sp.toString();
    return `/admin/accounts${qs ? `?${qs}` : ""}`;
  };

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <nav aria-label="Show" className="flex flex-wrap gap-2">
          {SHOWS.map((s) => (
            <Link
              key={s.value}
              href={link({ show: s.value })}
              aria-current={s.value === show ? "page" : undefined}
              className={cn(
                "rounded-full border px-4 py-1.5 text-sm font-semibold",
                s.value === show ? "border-primary bg-primary text-primary-foreground" : "border-border bg-surface hover:border-primary",
              )}
            >
              {s.label} ({counts[s.value]})
            </Link>
          ))}
        </nav>
        <form action="/admin/accounts" className="flex gap-2">
          {show !== "all" ? <input type="hidden" name="show" value={show} /> : null}
          <label htmlFor="account-search" className="sr-only">Search accounts</label>
          <input
            id="account-search"
            name="q"
            type="search"
            defaultValue={q}
            placeholder="Name, email, school or shop"
            className="h-10 w-64 rounded-[8px] border border-border bg-surface px-3 text-sm"
          />
          <button type="submit" className="h-10 rounded-[8px] bg-primary px-4 text-sm font-semibold text-primary-foreground">Find</button>
        </form>
      </div>

      {!complete ? <p className="text-sm text-danger">Only the first 50,000 accounts are listed.</p> : null}

      {rows.length === 0 ? (
        <EmptyState icon={<Users aria-hidden />} title={q ? "No accounts match" : "No accounts here yet"}>
          {q ? "Try a different name or email." : "Accounts appear here as people sign up."}
        </EmptyState>
      ) : (
        <Card className="overflow-x-auto p-0">
          <table className="w-full text-left text-sm" data-testid="accounts-table">
            <thead className="border-b border-border text-muted-foreground">
              <tr>
                <th className="px-4 py-3 font-semibold">Name</th>
                <th className="px-4 py-3 font-semibold">Email</th>
                <th className="px-4 py-3 font-semibold">Seller</th>
                <th className="px-4 py-3 font-semibold">Joined</th>
                <th className="px-4 py-3 font-semibold">Last signed in</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((a) => (
                <tr key={a.id} className="border-b border-border last:border-0">
                  <td className="px-4 py-3">
                    <span className="font-semibold">{a.name || "No name yet"}</span>
                    {a.roles.includes("admin") ? <span className="ml-2 rounded-full bg-accent-soft px-2 py-0.5 text-xs font-semibold">Admin</span> : null}
                    {a.school ? <span className="block text-xs text-muted-foreground">{a.school}</span> : null}
                  </td>
                  <td className="px-4 py-3">{a.email}</td>
                  <td className="px-4 py-3">
                    {a.seller ? (
                      <>
                        <span className="block">{SELLER_STATUS[a.seller.status] ?? a.seller.status}</span>
                        {a.seller.shop ? (
                          a.seller.shop.published ? (
                            <Link href={`/shop/${a.seller.shop.slug}`} className="text-xs font-semibold text-primary hover:underline">{a.seller.shop.name}</Link>
                          ) : (
                            <span className="text-xs text-muted-foreground">{a.seller.shop.name} (not public)</span>
                          )
                        ) : null}
                      </>
                    ) : (
                      <span className="text-muted-foreground">No</span>
                    )}
                  </td>
                  <td className="whitespace-nowrap px-4 py-3">{joined.format(new Date(a.createdAt))}</td>
                  <td className="whitespace-nowrap px-4 py-3">{a.lastSignIn ? joined.format(new Date(a.lastSignIn)) : "Never"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}

      {pages > 1 ? (
        <nav aria-label="Pages" className="flex items-center justify-between text-sm">
          {page > 1 ? <Link href={link({ page: page - 1 })} className="font-semibold text-primary hover:underline">Previous</Link> : <span />}
          <span className="text-muted-foreground">Page {Math.min(page, pages)} of {pages}</span>
          {page < pages ? <Link href={link({ page: page + 1 })} className="font-semibold text-primary hover:underline">Next</Link> : <span />}
        </nav>
      ) : null}
    </div>
  );
}
