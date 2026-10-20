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
- All stock changes go through `applyMovement` in `src/lib/stock.ts` (locations, lots, serials, cached
  item total). Shipment delivery shared by UI and API: `src/lib/shipment-service.ts`.
- REST API `/api/v1/*` uses `handler(scope, fn)` from `src/lib/api.ts`; the API key lives in the tenant DB.
  The OpenAPI spec in `src/lib/openapi.ts` is the single source for `/api/v1/openapi.json`,
  `/docs/api/swagger` (Swagger UI) and `/docs/api`. Update it whenever an endpoint changes.
- MySQL: no `.returning()` — use `.$returningId()`; upserts with `onDuplicateKeyUpdate`; `like` is
  case-insensitive. After a schema change: `pnpm db:generate` then `pnpm db:migrate`.
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

## Roadmap (current state: phases 1–2 done; next = phase 3)
Detailed acceptance criteria for every item: `docs/PHASE3_PROMPT.md`. Work top-down, one commit per item.

### Phase 3 — blocking before the first paying client
1. **Email.** No email sending exists: no forgot-password, no invitation links, no notifications. Add SMTP
   (Nodemailer, env-configured, console fallback in dev), password reset flow, invitation emails.
2. **Automated tests.** None yet. Cover the stock engine (lots, serials, transfers, order fulfilment) and
   tenant isolation (data and API keys never cross tenants) with Vitest + a real MySQL.
3. **Pagination.** Items, movements, orders, shipments load every row. Add server-side paging (50/page) and
   search; add a global `/movements` page with filters.
4. **Error and success feedback.** Expected validation errors must show inline instead of the generic error
   page; success toasts after writes; no double submits.
5. **Security hardening.** Login rate limiting, session invalidation on password change, security headers,
   API rate limits per key. (Password hashing, httpOnly cookies and role checks already exist.)
6. **Operations.** Auto-migration on startup, scripted backups of every tenant database, logging and error
   monitoring, `/api/health`. With one database per client this must be scripted, not manual.
7. **Super-admin panel.** `/admin` on the root domain for platform admins: list/suspend/activate tenants,
   retry failed provisioning, manage the database pool, platform stats.

### Expected by most businesses soon after
- Item photos (file storage).
- Printing: barcode labels, delivery notes and stock reports as PDF.
- Stock count workflow (count sheet, variance, apply differences) instead of individual adjustments.
- Returns from customers and to suppliers.
- Global movements page with filters, audit log search.
- Notifications on low stock, overdue shipments and expiring lots (email or in-app).
- Onboarding for a new organization: first category and items, import wizard, optional demo data.
- User profile page, two-factor authentication.

### Nice to have, depends on clients
- Packaging units (box of 12), multiple suppliers per item with prices, VAT rates on documents.
- Mobile-friendly scan mode as an installable PWA.
- Organization deletion and full data export (GDPR).
- Integrations with accounting software and courier APIs (Econt, Speedy).

### Deployment (Hostinger)
Target is a Hostinger Business/Cloud plan with "Node.js web app" in hPanel, or a KVM VPS. Shared hosting
cannot run `CREATE DATABASE`: use `TENANT_DB_MODE=manual` + `pnpm db:pool:add`. Open question: whether one
Node.js web app can receive several subdomains or a wildcard; if not, switch tenant resolution to paths in
`src/lib/tenant.ts` or use a VPS. Details in `README.md` and `docs/PHASE3_PROMPT.md`.
