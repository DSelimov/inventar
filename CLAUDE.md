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
