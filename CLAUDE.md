# Инвентар — notes for Claude Code

Universal inventory SaaS. **UI, demo data, README and commit messages are in Bulgarian**; code identifiers and
comments may be English. Reply to the user in the language they write in.

## Stack
TypeScript · Next.js 16 (App Router, Server Actions, Route Handlers) · Drizzle ORM + mysql2 · MySQL 8 ·
Tailwind CSS 4 · lucide-react · date-fns (bg) · html5-qrcode. Package manager: pnpm (see `allowBuilds` in
`pnpm-workspace.yaml`; without it every pnpm script fails with ERR_PNPM_IGNORED_BUILDS).

## Architecture (one tenant = one subdomain = one database)
- Control DB (`CONTROL_DATABASE_URL`): organizations, users, memberships, sessions, database_pool.
  Schema `src/db/control-schema.ts`, migrations `drizzle/control`.
- Tenant DB per organization (`inv_<subdomain>`): all business data. Schema `src/db/tenant-schema.ts`,
  migrations `drizzle/tenant`, applied to every tenant by `pnpm db:migrate`.
- Tenant resolution from the `Host` header: `src/lib/tenant.ts`. Pooled connections + provisioning
  (`TENANT_DB_MODE` auto = CREATE DATABASE, manual = pool via `pnpm db:pool:add`): `src/db/tenant.ts`.
- Root domain = portal (`(auth)/portal`, login, register). Tenant subdomain = the app (`(app)/…`).

## Conventions
- Every page/action starts with `const ctx = await requireContext(level)` (`src/lib/auth.ts`); levels
  read < write < delete < manage < owner (`src/lib/permissions.ts`). Use `ctx.db` for all tenant data.
- Reads live in `src/lib/queries.ts` (first argument is the tenant db). Writes live in `src/lib/actions/*`
  and call `audit(ctx, …)`; events go through `emit(ctx.db, event, payload)` (`src/lib/webhooks.ts`).
- Money and quantities are `decimal` columns (`money()` / `qty()` helpers in `tenant-schema.ts`) read as JS
  numbers; never add or multiply them with plain `+`/`*` — use `src/lib/money.ts` and `src/lib/quantity.ts`
  (a test fails on `… * unitCost/unitPrice`). Quantity inputs follow the item's `quantityDecimals`.
- All stock changes go through `applyMovement` in `src/lib/stock.ts` (locations, lots, serials, cached
  item total, cost and value via `src/lib/valuation.ts` — average or FIFO). Shipment delivery shared by UI and API: `src/lib/shipment-service.ts`.
- REST API `/api/v1/*` uses `handler(scope, fn)` from `src/lib/api.ts`; the API key lives in the tenant DB.
  The OpenAPI spec in `src/lib/openapi.ts` is the single source for `/api/v1/openapi.json`,
  `/docs/api/swagger` (Swagger UI) and `/docs/api`. Update it whenever an endpoint changes.
- MySQL: no `.returning()` — use `.$returningId()`; upserts with `onDuplicateKeyUpdate`; `like` is
  case-insensitive. After a schema change: `pnpm db:generate` then `pnpm db:migrate`.
  Check the generated SQL: drizzle-kit's `MODIFY COLUMN` drops `DEFAULT` — add it back by hand, and give the
  file a descriptive name (rename the tag in `meta/_journal.json` too).
  Restart `pnpm dev` after a tenant schema change: the cached tenant Drizzle instances keep the old schema
  and relational queries silently miss the new columns.
  Don't run `pnpm build` while `pnpm dev` is running: the dev server goes stale and browsers reload in a
  loop. If it happens, stop dev, `rm -rf .next/dev`, start again.
- Enum labels: `STATUS_LABELS` in `src/lib/utils.ts`; badge tones in `src/components/ui/badge.tsx`.
- Keep the design: tokens in `src/app/globals.css`, components in `src/components/ui`.

## Run
```bash
cp .env.example .env && docker compose up -d mysql
pnpm install && pnpm db:migrate && pnpm db:seed && pnpm dev
# portal: http://localhost:3000/portal · tenant: http://demo.localhost:3000 (admin@demo.bg / demo1234)
```
Set `APP_DOMAIN` in `.env` to the host:port you actually use (the seed prints the URLs).
On localhost the session cookie is per subdomain (log in on each); on a real domain it spans `.APP_DOMAIN`.

## Definition of done
`pnpm typecheck`, `pnpm lint`, `pnpm build` clean; the flow verified in a browser or via curl against the
running app, with DB state checked; commit in Bulgarian. No `Co-Authored-By` lines.

## Roadmap (current state: phases 1–3 done; next = phase 4)
Phase 3 (`docs/PHASE3_PROMPT.md`) is done, as are item photos, PDF printing, stock counts, returns,
notifications, onboarding, profile and TOTP. Detailed acceptance criteria for phase 4:
`docs/PHASE4_PROMPT.md`. Work in the order A → B → C → D → E, one commit per item.

### Phase 4 — Bulgarian market
- **A. Money, quantities, valuation** (blocking): money as `decimal` (A1); fractional quantities and units
  (A2); euro switch from BGN at 1.95583 with history (A3); cost on every movement, weighted average / FIFO,
  stock value at a date and margins (A4); VAT rates on lines, ЕИК and ДДС № separate on partners (A5);
  write-off protocol, receipt notes, gap-free document numbering (A6).
- **B. Invoicing** (blocking): invoices, credit/debit notes, proformas per ЗДДС with 10-digit continuous
  numbering, from orders/shipments, PDF + email, payment status (B1); ЕИК/VIES validation and lookup (B2);
  export for the accountant (B3). Fiscal receipts (Н-18/СУПТО) stay out of scope.
- **C. Paid service:** plans and limits, trial, read-only on lapse (C1); Stripe billing and our own
  invoices (C2); legal pages, GDPR, organization deletion and export (C3).
- **D. Everyday use:** offline PWA scan mode (D1); reorder suggestions (D2); multiple suppliers per item
  (D3); packaging units (D4); help centre (D5).
- **E. Integrations:** Econt / Speedy / BOX NOW (E1); WooCommerce, Shopify, eMAG (E2); Microinvest, Ajur,
  Плюс-Минус (E3); SAF-T when a client needs it (E4).

### Deployment (Hostinger)
Target is a Hostinger Business/Cloud plan with "Node.js web app" in hPanel, or a KVM VPS. Shared hosting
cannot run `CREATE DATABASE`: use `TENANT_DB_MODE=manual` + `pnpm db:pool:add`. Open question: whether one
Node.js web app can receive several subdomains or a wildcard; if not, switch tenant resolution to paths in
`src/lib/tenant.ts` or use a VPS. Details in `README.md` and `docs/PHASE3_PROMPT.md`.
