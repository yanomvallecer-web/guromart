# GuroMart architecture

Last updated 9 October 2026, Phase 2 in progress.

## 1. The existing prototype

The prototype at https://guromart.grok.me was built and is hosted on Grok's app builder (its page metadata carries a `grok-project-id`). The public pages show no framework bundle, backend API or auth provider that could be reused, and no source repository was available to inspect. A review of the live site (in the project files, `reviews/prototype-mvp-gap-list.md`) found:

- **Worth keeping:** the positioning, the peso pricing, the Filipino teacher taxonomy (Nursery to Grade 12, MATATAG/K to 12/private curricula, subjects such as AP, MAPEH, GMRC, TLE), the Browse filter model with filters kept in the URL, honest empty states, and the "not the official DepEd website" disclaimer.
- **Missing:** a visible sign-in, seller file upload, product pages, checkout, payments, delivery, payouts, legal pages and moderation.

**Decision:** build a new codebase on the recommended stack, and carry over the prototype's information architecture, taxonomy, URL-based filters and copy. Without source code there is nothing to migrate, so this is not a stack migration. If the prototype's source is exported later, it can be compared against this one for UI details.

## 2. Stack

| Layer | Choice | Why |
| --- | --- | --- |
| Web app | Next.js 16 (App Router, Cache Components), React 19, TypeScript | Server Components keep data access and authorization on the server; one deployable for UI and API |
| UI | Tailwind CSS 4, shadcn-style components (Radix Slot, CVA), Lucide icons | Accessible primitives we own and can restyle |
| Data | Supabase PostgreSQL with migrations in `supabase/migrations` | Relational integrity for orders, ledger and entitlements; row-level security |
| Auth | Supabase Auth: email one-time code, optional Google | Teachers mostly have Gmail or DepEd Google accounts; no passwords to manage |
| Files | Supabase Storage: private buckets for resources and IDs, public buckets for previews | Signed, expiring download URLs issued only after an entitlement check |
| Validation | Zod at every server boundary | Forms, URL parameters and webhook payloads |
| Payments | PayMongo Checkout (Phase 3) | See section 6 |
| Search | PostgreSQL full-text (`simple` config, weighted title/topic/summary/competency/description) plus trigram index on titles | Enough for launch scale; Meilisearch only if relevance or typo tolerance becomes a real problem |
| Hosting | Vercel + Supabase (Singapore region) | Managed, close to the Philippines |
| CI | GitHub Actions: lint, types, unit, database and end-to-end tests | |

## 3. Security model

Authorization is enforced in three layers, and the inner layers never trust the outer ones.

1. **Proxy (`src/proxy.ts`).** Refreshes the Supabase session cookie and redirects signed-out visitors away from `/account`, `/seller` and `/admin`. This is a convenience, not a security boundary.
2. **Data access layer (`src/lib/auth/dal.ts`).** Every protected page and server action calls `requireViewer` or `requireArea`, which reads the verified JWT (`getClaims`) and the user's roles from the database. A missing role renders a 403 (`forbidden()`).
3. **Database row-level security.** Enabled on every table (a test fails if any table lacks it). Policies decide what each user can read and write, and triggers block privileged column changes from browser sessions:
   - Sellers can create drafts and submit for review, but only staff can publish, reject, suspend, feature, or change ratings, sales counts and file-format summaries. Editing a live listing sends it back to review.
   - Sellers cannot change their own status, plan, commission, verification or copyright strikes.
   - Orders, payments, entitlements, ledger entries and payouts have **no** browser write policy. Only server code using the service role, after verifying a payment webhook, can create them.
   - The seller ledger is append-only (a trigger rejects updates and deletes). Each order item can produce only one sale entry.
   - Reviews require an active entitlement, so only real buyers can review.
   - Resource file paths are invisible to buyers. Storage policies keep each seller inside their own folder.
   - Sensitive actions (role grants, listing status changes, seller onboarding) are written to `audit_logs`.

The service-role client (`src/lib/supabase/admin.ts`) is server-only and reserved for webhooks, signed downloads and admin jobs that have already authorized the caller.

Identity documents live in the private `verification-documents` bucket under the seller's own folder. Staff open them through `/admin/verification-files/{id}`, which issues a five-minute link and logs the view. Decisions go through `review_verification()` only. Payout details are visible only to the seller and staff, shown masked, and every change is written to the audit log with just the last four digits, because changing where money goes is a common account-takeover step. A retention period for ID documents still needs to be set under the Data Privacy Act (RA 10173).

Other measures in place: security headers (`nosniff`, frame denial, referrer policy, permissions policy), same-site-only redirect targets after sign-in, input validation on every form and URL parameter, Supabase Auth rate limits on email codes. Application-level rate limiting for uploads, reports and checkout is planned for Phases 2 to 4.

## 4. Data model

35 tables in `public`, grouped by area. Money is stored as integer centavos in PHP.

- **Identity:** `profiles` (created by trigger for each auth user), `user_roles` (seller, publisher, admin; every account can buy).
- **Taxonomy (admin-editable):** `grade_levels`, `subjects`, `product_categories` (resource types, with a `kind` for future physical goods and services), `curricula`, `academic_periods` (a kind plus a number, so quarters, trimesters, semesters, weeks and lessons all fit), `languages`.
- **Sellers:** `seller_accounts` (type, status, plan, commission override, Founding Seller end date, verification status, copyright strikes), `storefronts`, `seller_verifications`, `seller_payout_methods`.
- **Catalog:** `products` (slug, metadata, price, license, status, denormalized rating, sales and download counts, file formats, generated search vector), `product_grade_levels` (a resource can span grades), `product_files` (private, with size, hash and malware scan status), `product_previews` (public images).
- **Commerce:** `carts`, `cart_items`, `orders` (human-readable `GM-` numbers), `order_items` (price, commission and seller earnings snapshot; a check constraint makes the split add up), `payments`, `payment_events` (unique per provider event, which makes webhook processing idempotent), `refunds`, `disputes`, `entitlements`, `downloads`.
- **Money out:** `seller_ledger_entries` (append-only; sale, refund, payout, reversal, adjustment; `available_at` implements the 7-day hold), `payouts`, and the `seller_balances` view.
- **Trust and support:** `reviews`, `wishlists`, `notifications`, `copyright_reports`, `support_tickets`, `audit_logs`, `platform_settings` (commission rates, minimum price, payout minimum and hold, upload size limit).

Business rules from the business model draft are encoded as settings or constraints: Starter commission 30%, Pro 15%, ₱30 minimum price for paid items (free allowed), ₱500 minimum payout, 7-day hold, 100 MB upload limit.

## 5. Digital delivery

1. **Upload (built in Phase 2).** The browser asks the server for an upload ticket. The server checks the seller owns the listing, the listing isn't live, and the file's extension and size are allowed, then issues a one-time signed upload URL for `product-files/{seller_account_id}/{product_id}/{random}.{ext}` (private). The browser uploads straight to storage, so large files never pass through the web server. The server then reads the stored object's size, content type and first bytes and checks they match the claimed type (PDF, Office, ZIP, PNG, JPG, WebP). Anything that fails is deleted. Only then is a `product_files` row created, with `scan_status = pending`. Database triggers also refuse rows outside the seller's folder, changes to files while a listing is live, and more than 10 files or 6 previews.
2. **Review (built in Phase 2).** Staff open the review queue, download each file through `/admin/files/{id}` (a five-minute signed link, logged in `audit_logs`), and mark it safe or blocked. A database trigger refuses to publish any listing unless every file is marked clean, the seller confirmed their rights, and there is a preview. `review_listing()` approves or rejects (a note is required) and notifies the seller. Approving a seller's first listing activates the account and publishes the shop; identity verification gates payouts, not listing. When a malware scanning service is chosen, it will set the same `scan_status` field.
3. On download, the server checks for an active entitlement, records a `downloads` row and returns a signed URL valid for a few minutes. Public URLs are never issued for resource files.

## 6. Payments decision

**PayMongo** for checkout, as the business model recommends: its e-wallet and QR Ph fees are pure percentages (QR Ph 1.5%, Maya 2.0%, GCash 2.5%, fees checked October 2026), which matters for orders under ₱300. Xendit adds a fixed ₱11 per transaction.

Marketplace split payouts: we have not confirmed that PayMongo can split a payment between GuroMart and sellers automatically for this account type. So GuroMart will collect the full payment, record each seller's share in the append-only ledger, and pay sellers through an auditable payout workflow (biweekly, ₱500 minimum, 7-day hold). If PayMongo or Xendit (xenPlatform) confirms automated split payouts during onboarding, the ledger stays as the source of truth and the payout step is automated.

Integration plan (Phase 3): create a Checkout Session server-side from the cart (prices read from the database, never the browser); verify the `Paymongo-Signature` header on webhooks with the webhook secret; insert into `payment_events` with `on conflict do nothing` for idempotency; in one transaction mark the order paid, create entitlements, and post ledger entries. A client-side "success" page only shows status; it never grants access. Sandbox (test keys) first; live keys only after PayMongo business verification.

## 7. Known issues

- On the first request after a server start, Next.js logs a one-time warning that Supabase Auth read the clock while prerendering `/account`, `/sell` and `/seller`. Pages render correctly. To investigate with the next Supabase SSR release.
- Search "relevance" sorting currently orders matches by newest; ranked results need a small database function (Phase 2).
