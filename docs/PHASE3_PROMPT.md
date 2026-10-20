# Prompt for Claude Code — Инвентар, phase 3 (production readiness)

Paste this file's content as the first message in a new Claude Code session opened in the project root
(`~/projects/inventory` or wherever the repo is cloned). Read `CLAUDE.md` and `README.md` first.

---

You are continuing work on **Инвентар**, a universal inventory SaaS (Next.js 16, Drizzle ORM, MySQL 8,
Tailwind 4) with **one MySQL database and one subdomain per tenant**. Phases 1 and 2 are done and committed:
categories with custom fields, items with variants / lots / serial numbers, multiple locations with transfers,
partners, purchase and sales orders with partial fulfilment, shipments, collections, calendar, barcode scanning,
CSV import/export, reports with configurable parameters, users and roles, audit log, REST API with keys,
webhooks, OpenAPI 3.1 + Swagger UI documentation, portal + per-tenant provisioning.

Rules: UI texts, demo data and commit messages in **Bulgarian**; follow the conventions in `CLAUDE.md`
(`requireContext` → `ctx.db`, reads in `queries.ts`, writes in `actions/*`, stock only via `applyMovement`,
update `src/lib/openapi.ts` for any API change). Verify every feature in the running app (browser or curl)
and check the database state; `pnpm typecheck && pnpm lint && pnpm build` must be clean before each commit.
Work task by task, commit after each, and report what you verified.

## Phase 3 — blocking before the first paying client (do in this order)

### 1. Email + password reset + invitations
- Add an email module (`src/lib/mail.ts`) using Nodemailer with SMTP settings from env
  (`SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, `MAIL_FROM`). When SMTP is not configured, log the
  message to the console and keep the app working (dev mode).
- Forgot-password flow on `/login`: request by email → signed one-time token (control DB table
  `password_resets`, 1 hour expiry) → reset page → invalidate all sessions of that user.
- Invitations: `Настройки › Потребители` "Добави" sends an email with a link to set a password instead of
  requiring an initial password typed by the admin. Keep the current direct method as a fallback.
- Bulgarian templates (plain text + simple HTML) with the tenant name and URL.

### 2. Automated tests
- Vitest. Unit tests for `applyMovement` / `transferStock` (untracked, lot, serial, insufficient stock,
  adjust on tracked item rejected), `changeShipmentStatus` (inbound creates lots, outbound consumes, order
  becomes partial/completed, second delivery rejected), `parseCsv`/`mapHeader`, `subdomainFromHost`,
  permissions.
- Integration tests against a real MySQL (docker compose): tenant isolation (data written in tenant A is
  invisible in tenant B; an API key from A is rejected on B's subdomain), provisioning creates and migrates
  a database, API auth/scopes.
- `pnpm test` script; tests must run in CI-like fashion with `CONTROL_DATABASE_URL` pointing at a test
  control DB and `TENANT_DB_PREFIX=test_`.

### 3. Pagination and server-side search
- Items, movements (new global page `/movements` with filters: item, location, type, date range, user),
  orders, shipments, partners, audit log: page size 50, page controls, total count; filters preserved in
  the query string. Keep the current filter bar component.
- Reports stay aggregate (no paging) but must cap list sections at 50 rows with a link to the filtered list.

### 4. Error and success feedback
- Server actions return `{ error }` instead of throwing for expected validation failures; forms show the
  message inline (use `useActionState` where a form needs it). Keep thrown errors only for unexpected
  failures.
- Success toasts after create/update/delete/status changes (small client toast component, no dependency).
- Disable submit buttons while pending (already done via `SubmitButton`) and prevent double submits.

### 5. Security hardening
- Login rate limiting per IP + email (control DB table or in-memory with a MySQL fallback), lockout message
  in Bulgarian.
- Invalidate other sessions on password change; "Изход от всички устройства" in profile.
- Security headers in `next.config.ts` (CSP that allows the Swagger UI CDN, X-Frame-Options, Referrer-Policy,
  Permissions-Policy). Rate limit on `/api/v1/*` per API key (e.g. 600 requests/minute) with 429 + headers.
- Review every action for IDOR: ids are per tenant DB already; make sure cross-table checks (e.g. lot
  belongs to item) exist where stock is touched.

### 6. Operations
- Auto-migrate on startup (`instrumentation.ts`): control DB, then every active tenant; log failures.
- `pnpm db:backup` script: `mysqldump` of the control DB and each tenant DB to `backups/<date>/`, with a
  retention option; document a cron line for Hostinger/VPS.
- Health endpoint `/api/health` (control DB ping, tenant pool size, version) without auth.
- Structured logging helper (`src/lib/log.ts`) and an error boundary that reports to the log; optional
  Sentry DSN env var.

### 7. Platform admin (super-admin)
- Control DB: `users.is_platform_admin`. A `/admin` area on the **root domain** only, visible to platform
  admins: list of organizations (name, subdomain, status, DB, users count, created), suspend / activate,
  retry failed provisioning, database pool management (add/list), platform stats.
- Suspended organizations show the existing `/provisioning` page with the suspended message; API returns 503.

## Backlog after phase 3 (pick based on client feedback)
- Item photos (upload to local disk or S3-compatible storage, thumbnails).
- Printing: barcode labels (Code128/EAN13, A4 sheets), delivery note and stock report PDFs.
- Stock count workflow: create a count session per location, enter counted quantities (scanner friendly),
  variance report, apply adjustments in one transaction.
- Returns: customer returns (inbound against a sales order) and supplier returns.
- Notifications: in-app bell + daily email digest (low stock, overdue shipments, lots expiring in 30 days).
- Onboarding wizard for a new organization; option to load demo data; delete organization + full export.
- User profile page, two-factor authentication (TOTP).
- Packaging units, multiple suppliers per item with prices, VAT rates on documents.
- PWA manifest and offline-tolerant scan page.
- Integrations: accounting export, courier APIs (Econt, Speedy).

## Deployment notes (Hostinger)
- Target: Hostinger shared **Business/Cloud** plan with "Node.js web app" in hPanel (Node 22), or a KVM VPS.
- Shared hosting cannot run `CREATE DATABASE`: use `TENANT_DB_MODE=manual`, create databases in hPanel and
  register them with `pnpm db:pool:add <db> <user> <pass> <host>`.
- Open question to test on the real account: whether one Node.js web app can receive several subdomains or
  a wildcard. If not, switch tenant resolution to path-based (`/<subdomain>/…`) in `src/lib/tenant.ts`, or
  move the Node app to a VPS. Prepare for hPanel: `output: "standalone"` in `next.config.ts`, honour `PORT`,
  npm lockfile alongside pnpm, auto-migration on boot (task 6).
- `APP_DOMAIN`, `APP_PROTOCOL=https`, `APP_SECRET` are required in production. Wildcard DNS + wildcard SSL
  (Let's Encrypt DNS challenge or Cloudflare) when subdomains are used.

## Demo data and access
`pnpm db:seed` creates organizations `demo` (full data) and `vtora` (empty). Users: admin@demo.bg /
demo1234 (owner of both), sklad@demo.bg / demo1234 (staff in demo). Portal: `http://<APP_DOMAIN>/portal`.
