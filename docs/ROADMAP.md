# GuroMart roadmap and feature status

"Done" means implemented and covered by automated tests (unit, database or end to end) in this repository. Anything else is marked as not started or partial.

## Phase 1: Foundation (this release)

| Item | Status | Tested by |
| --- | --- | --- |
| Inspect existing prototype, choose stack | Done | `docs/ARCHITECTURE.md` |
| Project architecture (Next.js 16, Supabase, Tailwind, shadcn-style UI) | Done | Build, lint, typecheck in CI |
| Database schema and migrations for the full MVP | Done | `supabase/tests/rls.test.ts` |
| Row-level security, guard triggers, audit log | Done | `supabase/tests/rls.test.ts` |
| Email code sign-in and sign-up, session refresh, sign-out | Done | `e2e/accounts.spec.ts` |
| Facebook and Google sign-in | Built, needs provider credentials | Buttons and redirect tested locally; provider round trip not tested (needs a Meta app and Google OAuth client) |
| Role-based access on the server (buyer, seller, publisher, admin) | Done | `src/lib/auth/roles.test.ts`, `e2e/accounts.spec.ts` |
| Design system tokens and components | Done | Visual check on desktop and mobile |
| Homepage from real data with empty states | Done | `e2e/visitor.spec.ts` |
| Browse with server-side filters, sort and pagination | Done | `src/lib/catalog/search-params.test.ts`, `e2e` |
| Resource detail and shop pages (read-only) | Done | `e2e/accounts.spec.ts` |
| Account profile editing | Done | `e2e/accounts.spec.ts` |
| Seller onboarding steps 1 to 3 and seller dashboard | Done | `supabase/tests`, `e2e/accounts.spec.ts` |
| Admin overview with live counts and audit trail | Done | `e2e/accounts.spec.ts` |
| CI pipeline | Written | Runs once the repository is on GitHub |

## Phase 2: Marketplace core (done)

| Item | Status | Tested by |
| --- | --- | --- |
| Product create and edit form with copyright declaration, license choice and price rules (free or ₱30 to ₱10,000) | Done | `src/lib/listings/listings.test.ts`, `e2e/listings.spec.ts` |
| Secure uploads: one-time signed upload URLs to owner-scoped paths, extension and size checks, file signature check after upload, rejected files deleted, private resource bucket | Done | `src/lib/listings/listings.test.ts`, `e2e/listings.spec.ts` |
| Database guards on listing files: owner folder only, no file changes while live, at most 10 files and 6 previews | Done | `supabase/tests/rls.test.ts` |
| Uploaded files start quarantined ("waiting for safety check") | Done | `e2e/listings.spec.ts` |
| Seller product management: list, submit for review with a readiness checklist, withdraw, archive | Done | `e2e/listings.spec.ts` |
| Admin review queue: staff download files privately (logged), mark each file safe or blocked, approve or reject with a note the seller sees | Done | `supabase/tests/rls.test.ts`, `e2e/listings.spec.ts` |
| A listing can only go live with the rights confirmation, a preview, and every file marked safe (enforced in the database) | Done | `supabase/tests/rls.test.ts` |
| Approving a seller's first listing opens their shop; identity verification gates payouts, not listing | Done | `supabase/tests/rls.test.ts`, `e2e/listings.spec.ts` |
| Seller identity verification: private ID upload (checked like other uploads), one request at a time, staff review with logged document access, reject with a note | Done | `supabase/tests/rls.test.ts`, `e2e/verification.spec.ts` |
| Shop profile: name, tagline, about, logo and banner (checked uploads, old images deleted), show or hide the shop; the shop address and owner can't be changed | Done | `supabase/tests/rls.test.ts`, `src/lib/validation/validation.test.ts`, `e2e/shop.spec.ts` |
| Ranked search: relevance order, Filipino/English synonyms (DLL, agham, matematika, AP and more), typo tolerance on titles, all filters in one database query | Done | `supabase/tests/rls.test.ts`, `e2e/listings.spec.ts` |
| Payout details (GCash, Maya or bank), validated, shown masked, private to the seller and staff, every change audited | Done | `src/lib/validation/payout.test.ts`, `supabase/tests/rls.test.ts`, `e2e/verification.spec.ts` |
| Demo data for local development: `npm run seed:demo` loads 3 shops and 8 resources titled "[Demo]" with placeholder files through the normal publish checks, refuses non-local databases, and `--remove` deletes it all | Done | Run by hand against the local stack (add, browse, typo and synonym search, shop page, remove with no leftover files) |

## Phase 3: Transactions (in progress)

| Item | Status | Tested by |
| --- | --- | --- |
| Cart: paid, live resources only; no buying your own or something you already own; at most 50; totals from current server prices | Done | `supabase/tests/rls.test.ts`, `e2e/library.spec.ts` |
| Free "get" flow: adds a free resource to the library (granted by the database, never for paid resources) | Done | `supabase/tests/rls.test.ts`, `e2e/library.spec.ts` |
| My Library and downloads: the database checks ownership and logs each download, then the server signs a one-minute link to the private file; 60 downloads an hour per teacher; archived resources stay downloadable; revoked access is blocked | Done | `supabase/tests/rls.test.ts`, `e2e/library.spec.ts` |
| Orders from the cart with price and commission snapshots (Starter 30%, Pro 15%, or a negotiated rate) | Done | `supabase/tests/rls.test.ts` |
| PayMongo Checkout Sessions (test keys only; live keys refused) | Done against a local stand-in; needs a run with real PayMongo test keys | `src/lib/payments/paymongo.test.ts`, `e2e/checkout.spec.ts` |
| Webhook: signature checked on the raw body, each event applied once, amount and mode must match, then access, seller ledger credit (7-day hold), sales count, cart cleanup and notifications in one transaction; duplicate purchases flagged for refund | Done | `src/lib/payments/paymongo.test.ts`, `supabase/tests/rls.test.ts`, `e2e/checkout.spec.ts` |
| Order history and receipts; order page waits for confirmation and never unlocks on the redirect alone | Done | `e2e/checkout.spec.ts` |
| Expiring abandoned orders, failed-payment messages | Not started | |
| Seller earnings view, balances, commission breakdown | Not started (ledger entries are written) | |

## Phase 4: Marketplace operations

- Shop closing, with a scheduled job that deletes the seller's ID documents 90 days after closing (Data Privacy Act retention decision)
- Admin: listing moderation extras, categories and curricula, orders and payments, refunds and disputes, payouts, copyright reports and repeat-infringer strikes, platform settings
- Notifications (in-app and email), support tickets, reviews UI, wishlist

## Phase 5: Testing and deployment

- Security review, rate limiting on uploads, reports and checkout, performance and accessibility passes
- Production Supabase and Vercel setup, monitoring (Sentry or similar), backups and recovery drill

## Remaining dependencies (things only the GuroMart team can provide)

| Dependency | Needed for | Notes |
| --- | --- | --- |
| GitHub repository | Code hosting, CI, deploys | Not yet connected |
| Supabase project (Singapore region) | Any hosted environment | Free tier is fine for staging |
| Production email sender (SMTP, e.g. Resend or Amazon SES) | Sign-in codes at scale | Supabase's built-in sender is for testing only |
| Google OAuth client | Google sign-in | Optional |
| Meta (Facebook) app | Facebook sign-in | Optional |
| PayMongo account and business verification | Live payments | Test keys are enough for Phase 3 development |
| Confirmation of PayMongo payout capabilities | Automating seller payouts | Until then payouts are recorded and sent manually |
| Malware scanning service | Approving uploaded files | Until chosen, files stay quarantined for manual review |
| Terms of Service, Privacy Policy, refund policy, seller agreement, takedown policy | Public launch | Need review by a Philippine lawyer (RA 8293, RA 10173, RA 11967) |
| BIR registration and receipt rules | Selling to the public | Affects receipts and seller withholding |
| Vercel project and domain | Production hosting | |
