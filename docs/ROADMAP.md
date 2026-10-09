# GuroMart roadmap and feature status

"Done" means implemented and covered by automated tests (unit, database or end to end) in this repository. Anything else is marked as not started or partial.

## Phase 1: Foundation (this release)

| Item | Status | Tested by |
| --- | --- | --- |
| Inspect existing prototype, choose stack | Done | `docs/ARCHITECTURE.md` |
| Project architecture (Next.js 16, Supabase, Tailwind, shadcn-style UI) | Done | Build, lint, typecheck in CI |
| Database schema and migrations for the full MVP | Done | `supabase/tests/rls.test.ts` |
| Row-level security, guard triggers, audit log | Done | `supabase/tests/rls.test.ts` (26 tests) |
| Email code sign-in and sign-up, session refresh, sign-out | Done | `e2e/accounts.spec.ts` |
| Google sign-in | Built, needs provider credentials | Not tested (needs Google OAuth client) |
| Role-based access on the server (buyer, seller, publisher, admin) | Done | `src/lib/auth/roles.test.ts`, `e2e/accounts.spec.ts` |
| Design system tokens and components | Done | Visual check on desktop and mobile |
| Homepage from real data with empty states | Done | `e2e/visitor.spec.ts` |
| Browse with server-side filters, sort and pagination | Done (relevance ranking pending) | `src/lib/catalog/search-params.test.ts`, `e2e` |
| Resource detail and shop pages (read-only) | Done | `e2e/accounts.spec.ts` |
| Account profile editing | Done | `e2e/accounts.spec.ts` |
| Seller onboarding steps 1 to 3 and seller dashboard | Done | `supabase/tests`, `e2e/accounts.spec.ts` |
| Admin overview with live counts and audit trail | Done | `e2e/accounts.spec.ts` |
| CI pipeline | Written | Runs once the repository is on GitHub |

## Phase 2: Marketplace core (next)

- Seller onboarding steps 4 to 7: identity verification upload, payout details, first upload, submit for review
- Product create and edit form with copyright declaration and license choice
- Secure uploads to private storage with type and size checks, quarantine until scanned, preview image upload
- Seller product management (drafts, review status, archive)
- Ranked search (database function with `ts_rank`), Filipino/English synonyms (DLL and daily lesson log)
- Shop profile editing and publishing
- Demo seed data, clearly labelled, for local development

## Phase 3: Transactions

- Cart, PayMongo Checkout Sessions (sandbox), verified and idempotent webhooks
- Orders, receipts, failure handling, free "get" flow
- Entitlements, signed downloads, download history, My Library
- Seller earnings ledger, balances, commission breakdown

## Phase 4: Marketplace operations

- Admin: seller verification, listing moderation queue, categories and curricula, orders and payments, refunds and disputes, payouts, copyright reports and repeat-infringer strikes, platform settings
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
| PayMongo account and business verification | Live payments | Test keys are enough for Phase 3 development |
| Confirmation of PayMongo payout capabilities | Automating seller payouts | Until then payouts are recorded and sent manually |
| Malware scanning service | Approving uploaded files | Until chosen, files stay quarantined for manual review |
| Terms of Service, Privacy Policy, refund policy, seller agreement, takedown policy | Public launch | Need review by a Philippine lawyer (RA 8293, RA 10173, RA 11967) |
| BIR registration and receipt rules | Selling to the public | Affects receipts and seller withholding |
| Vercel project and domain | Production hosting | |
