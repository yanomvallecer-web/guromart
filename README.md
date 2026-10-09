# GuroMart

**Everything You Need to Teach, All in One Place.**

GuroMart is a multi-vendor marketplace where Filipino teachers discover, buy, download and sell teaching resources. This repository is the production application: Next.js on the front end and server, Supabase (PostgreSQL, Auth, Storage) for data, and PayMongo for payments (Phase 3).

- [Architecture and decisions](docs/ARCHITECTURE.md)
- [Roadmap, feature status and remaining dependencies](docs/ROADMAP.md)

## What works today (Phases 1 and 2, part of Phase 3)

| Area | Status |
| --- | --- |
| Database schema for the whole MVP (35 tables), migrations, indexes, constraints | Done, tested |
| Row-level security on every table, server-only writes for money and access | Done, tested |
| Email code sign-in and sign-up (Supabase Auth), sessions refreshed in the proxy | Done, tested end to end |
| Facebook and Google sign-in | Built, each off until its provider is configured |
| Roles (buyer, seller, publisher, admin) enforced on the server and in the database | Done, tested |
| Account page with profile editing | Done, tested end to end |
| Seller onboarding steps 1 to 3 (account, seller type, storefront) | Done, tested end to end |
| Seller dashboard (shop, status, onboarding checklist, resource counts) | Done |
| Admin overview with live counts and audit log | Done |
| Homepage, browse with server-side filters and pagination, resource and shop pages | Done, read real data, show empty states when there is none |
| Sellers create and edit listings, upload files and preview images securely, and submit for review | Done, tested end to end |
| Admin review queue: check files, approve or reject listings with a note | Done, tested end to end |
| Seller ID verification and payout details (GCash, Maya, bank), reviewed by staff | Done, tested end to end |
| Shop profile editing with logo and banner, show or hide the shop | Done, tested end to end |
| Ranked search with Filipino/English synonyms and typo tolerance | Done, tested |
| Optional demo data for local development (`npm run seed:demo`), clearly labelled | Done, run by hand |
| Cart, free resources added to My Library, secure logged downloads | Done, tested end to end |
| Checkout through PayMongo in test mode; resources unlock only on a verified payment event; order history and receipts | Done, tested end to end against a local PayMongo stand-in; not yet tried against PayMongo's own test servers |
| Seller earnings view and payouts | Not yet. See the roadmap. |

Nothing on the site is fabricated. With an empty database the homepage shows empty states, not sample products. Demo data is only loaded on request, locally, and every demo item is titled "[Demo]".

## Run it locally

You need Node.js 22+, Docker (for the local Supabase stack) and the Supabase CLI (`npx supabase` works).

```bash
npm install
npx supabase start          # starts Postgres, Auth, Storage and Mailpit; applies supabase/migrations
cp .env.example .env.local  # then fill in the values printed by `npx supabase status`
npm run dev                 # http://localhost:3000
```

In `.env.local`, set `NEXT_PUBLIC_SUPABASE_URL` to the API URL, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` to the publishable (anon) key and `SUPABASE_SECRET_KEY` to the secret (service role) key from `npx supabase status`.

Sign-in codes are emailed. Locally they land in Mailpit at http://127.0.0.1:54324.

To make yourself an admin, sign in once, then run:

```bash
node --env-file=.env.local scripts/grant-admin.mjs you@example.com
```

A fresh stack has an empty catalog. To browse with something in it, load the demo data:

```bash
npm run seed:demo              # 3 shops and 8 resources, all titled "[Demo] …"
npm run seed:demo -- --remove  # delete the demo accounts, listings and files
```

Demo shops say they are not real sellers, their files are one-page placeholders, and no reviews, ratings or sales are invented. The script refuses to run unless the Supabase URL is localhost. The homepage shelves are cached for about a minute, so new data can take a refresh or two to show there.

## Testing

| Command | What it checks | Needs |
| --- | --- | --- |
| `npm run test:unit` | Authorization rules, validation, upload type and size checks, search parameters, price formatting | Nothing |
| `npm run db:test:reset && npm run test:db` | Migrations apply cleanly; row-level security, triggers and constraints behave (sellers can't publish or edit others' listings, buyers can't create orders or entitlements, ledger is append-only, reviews need a purchase) | A disposable PostgreSQL 16 server in `TEST_DATABASE_URL` (never a Supabase project) |
| `npm run test:e2e` | Sign-up with an emailed code, profile editing, role-based access, opening a shop, creating a listing and uploading files (fake files rejected and deleted), catalog search, free resources and downloads, cart, paying through checkout (access unlocks only on a signed payment event; forged events refused), on desktop and mobile | The app running against local Supabase, plus `E2E_MAILPIT_URL=http://127.0.0.1:54324`, and the local PayMongo stand-in: run `node e2e/paymongo-stand-in.mjs` and start the app with `PAYMONGO_SECRET_KEY=sk_test_e2e PAYMONGO_WEBHOOK_SECRET=whsk_test_e2e PAYMONGO_API_BASE=http://127.0.0.1:4010` |
| `npm run lint` and `npm run typecheck` | Code quality | Nothing |

CI (`.github/workflows/ci.yml`) runs all of these on every pull request.

## Deploy

1. **Create a Supabase project** (region: Singapore is closest to the Philippines). Link it and push the schema:
   ```bash
   npx supabase link --project-ref <your-project-ref>
   npx supabase db push
   ```
2. **Configure Supabase Auth.** Set the Site URL to your domain and add `https://<your-domain>/auth/callback` to the redirect URLs. Make sure the email templates include `{{ .Token }}` so teachers can type the code. Set up a production SMTP sender (Supabase's built-in sender is rate-limited and only for testing).
3. **Optional: Facebook and Google sign-in.** Enable each provider in Supabase Auth with your Meta app or Google OAuth client, then set `NEXT_PUBLIC_AUTH_FACEBOOK_ENABLED=true` or `NEXT_PUBLIC_AUTH_GOOGLE_ENABLED=true`. Facebook accounts without an email address can still sign in; their profile name is used instead.
4. **Payments (test mode).** In the PayMongo dashboard (test mode), copy the secret key into `PAYMONGO_SECRET_KEY`, create a webhook for `https://<your-domain>/api/webhooks/paymongo` with the event `checkout_session.payment.paid`, and put its signing secret in `PAYMONGO_WEBHOOK_SECRET`. Only test keys are accepted for now.
5. **Deploy to Vercel.** Import the GitHub repository and set the environment variables from `.env.example` in the Vercel project settings. `SUPABASE_SECRET_KEY` must only ever be set as a server environment variable.
5. **Create the first admin** with `scripts/grant-admin.mjs` as above.

Secrets never go in the repository. `.env*` files are ignored, except `.env.example`, which holds no values.

## Project layout

```
src/app/            Routes (App Router). Server Components by default.
src/components/     UI primitives (shadcn-style) and site components.
src/lib/auth/       Session and role checks (data access layer).
src/lib/catalog/    Catalog queries and search parameter parsing.
src/lib/supabase/   Supabase clients: user session, public, service role.
src/proxy.ts        Session refresh and sign-in redirects.
supabase/           Migrations, local config, seed and database tests.
e2e/                Playwright end-to-end tests.
```

This app uses Next.js 16. Its APIs differ from older versions (for example `proxy.ts` replaces `middleware.ts`, and Cache Components are on), so check `node_modules/next/dist/docs/` before changing framework code.
