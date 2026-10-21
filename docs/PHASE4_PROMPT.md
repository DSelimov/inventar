# Prompt for Claude Code — Инвентар, phase 4 (Bulgarian market)

Paste this file's content as the first message in a new Claude Code session opened in the project root.
Read `CLAUDE.md`, `README.md` and `docs/PHASE3_PROMPT.md` first.

---

You are continuing work on **Инвентар**, a multi-tenant inventory SaaS (Next.js 16, Drizzle ORM, MySQL 8,
Tailwind 4, one database and one subdomain per tenant). Phase 3 (email, tests, paging, feedback, security,
operations, `/admin`) and most of "expected soon after" (photos, PDF printing, stock counts, returns,
notifications, onboarding, profile + TOTP) are done. Phase 4 makes the product sellable to Bulgarian
businesses: correct money and stock valuation, legal invoices, a paid subscription, daily-use features, then
integrations.

Rules: as in `CLAUDE.md` — UI, demo data and commits in **Bulgarian**; `requireContext` → `ctx.db`; reads in
`queries.ts`, writes in `actions/*` with `audit(ctx, …)`; stock only via `applyMovement`; OpenAPI in
`src/lib/openapi.ts` updated with every API change; Vitest tests for every engine change. Before each commit:
`pnpm typecheck && pnpm lint && pnpm test && pnpm build`, the flow verified in the browser with DB state
checked. One commit per numbered item. Where Bulgarian legal requirements are stated below, verify them
against the current text of the law (ЗДДС, ППЗДДС, ЗСч, Наредба Н-18) before implementing and note the source
in the commit message — do not rely on memory for rates, deadlines or mandatory fields.

Order of work: **A → B → C → D → E**. A and B block the first paying client.

---

## A. Money, quantities and stock valuation (foundation)

Current state, verified in code: prices and costs are `double` (`items.unit_cost`, `items.unit_price`,
`order_lines.unit_price`); every quantity is `int` (no kg, litres, metres); `stock_movements` stores no cost,
so stock value at a past date and cost of goods sold cannot be computed; one `organizations.currency` per
tenant, default `EUR`.

### A1. Exact money
- Migrate every money column to `decimal(14,4)` for unit amounts and `decimal(14,2)` for document totals.
  Drizzle `decimal` returns strings: add `src/lib/money.ts` (parse, add, multiply by quantity, round
  half-up to cents, format) and use it everywhere instead of float arithmetic. No `number` money math left
  in `src/` (grep check in a test).
- API: amounts as strings with 2–4 decimals in JSON; document the change in OpenAPI.
- Acceptance: 0.1 + 0.2 style sums are exact in reports, PDFs and API; the existing test suite passes.

### A2. Fractional quantities and units of measure
- Quantities `decimal(14,3)` (items, stock levels, lots, movements, order/shipment/count lines). Per item
  `unit` + `decimals` (0 for бр., 3 for кг/л/м). Serial-tracked items stay integer.
- Inputs, scanner (+1 only for integer units), CSV import, PDFs and API respect the item's decimals.
- Acceptance: receive 12.5 кг, sell 0.750 кг, count 11.750 кг — all exact; tests in `tests/db/stock.test.ts`.

### A3. Euro and the лев history
- Bulgaria uses the euro since 1 January 2026, fixed rate **1 EUR = 1.95583 BGN**. Add a one-off,
  idempotent per-tenant migration script `pnpm db:euro` for tenants whose currency is `BGN`: convert stored
  amounts at the fixed rate with correct rounding, set currency to `EUR`, keep the original currency and
  amount on historical documents (`original_currency`, `original_amount`), and record it in the audit log.
- PDFs of documents issued before the switch show the original лева amount (and the euro equivalent).
- Settings: currency is no longer free text — EUR default, a short list (EUR, USD, GBP, RON…) for
  foreign-currency partners later.
- Acceptance: a BGN test tenant converts exactly once; re-running changes nothing; totals match to the cent.

### A4. Cost on every movement and stock valuation
- `stock_movements.unit_cost` (decimal) and `value` (delta × cost). Receipts take cost from the purchase
  order line or the shipment line (add `unit_cost` to shipment lines); issues take the cost computed by
  the valuation method.
- Valuation method per tenant, chosen once in settings: **weighted average** (default, most common in
  Bulgarian SMEs) or **FIFO** (consumes lots / receipt layers in order). Implement in `src/lib/stock.ts`
  next to `applyMovement`; `items.unit_cost` becomes the current average, not a manual field.
- Reports: stock value at any date (per location / category), cost of goods sold for a period, gross margin
  per item and per customer. Stock report PDF gets a "към дата" parameter.
- Acceptance: tests for average and FIFO with receipts at different prices, partial issues, returns (back at
  the original cost), transfers (cost travels with stock) and count corrections.

### A5. VAT on lines
- VAT rates table per tenant seeded with the current Bulgarian rates (verify them; at the time of writing
  20 % standard, 9 % reduced, 0 % and exempt with a legal basis text). Default rate per item and per
  category; override per order line. Prices entered with or without VAT per tenant setting.
- Order and shipment lines store net, VAT rate, VAT amount and gross (decimal, rounded per line).
  Totals by rate on screen, in PDFs and in the API.
- Partner: ЕИК and ДДС № as separate fields (today one `vat_number` field), VAT-registered flag, country
  (EU / non-EU affects 0 % and reverse charge).

### A6. Missing warehouse documents
- **Протокол за брак** (write-off): reason, commission members, items with cost; issues stock with type
  `out` and reason; PDF with signatures.
- **Складова разписка / приемателен протокол** for receipts and **стокова разписка** (exists) now with
  prices and VAT totals.
- Continuous numbering per document type and year, generated inside the transaction (no gaps on rollback:
  use a counter table with `SELECT … FOR UPDATE`, not `count(*)` like `nextCountNumber` does today).

---

## B. Invoicing

### B1. Invoices, credit and debit notes
- New module `src/lib/invoicing.ts` + tables `invoices`, `invoice_lines`, `document_counters`.
  Types: фактура, кредитно известие, дебитно известие, проформа (proforma is not a tax document, own
  numbering).
- Numbering: 10-digit, continuous, no gaps, per tenant (optionally several series by location —
  verify the ЗДДС/ППЗДДС rules for series). Number assigned on issue, never on draft.
- Mandatory content per ЗДДС (verify the current list): number and date, date of tax event, supplier and
  recipient name, address, ЕИК, ДДС №, description and quantity, unit price without VAT, tax base, rate,
  VAT amount, total, legal basis when no VAT is charged, and the reason and original invoice for notes.
- Create an invoice from a sales order or from one or more delivered shipments (lines and prices copied,
  editable until issued); credit note from an invoice or from a customer return.
- Issued documents are immutable; corrections only through notes. Cancellation keeps the number and marks
  it annulled with a reason, according to the rules.
- PDF in Bulgarian (original + copy), email to the customer from the app with the PDF attached (uses the
  existing mail module), list with filters and paging, payment status (неплатена / частично / платена) and
  due date with an overdue notification.
- API: read endpoints + create-from-order; webhooks `invoice.issued`, `invoice.paid`.
- Acceptance: concurrent issue never produces duplicate or skipped numbers (test); totals per rate match
  line sums; credit note for a return reduces the open amount.

### B2. Partner data lookup
- ЕИК validation (checksum for 9- and 13-digit numbers) and ДДС № validation (`BG` + ЕИК).
- VIES check for EU VAT numbers (with a short cache table and graceful failure when VIES is down).
- Fill name and address from the Търговски регистър by ЕИК if a reliable public source or paid API is
  available — research first, put it behind a feature flag, never block saving.

### B3. Export for the accountant
- Monthly export of sales and purchase documents (CSV/Excel in the layout accountants import) and a
  purchase/sales VAT summary per rate. Full accounting-software integrations come in E.
- **Out of scope:** fiscal receipts and retail checkout. Software that issues fiscal receipts must comply
  with Наредба Н-18 and be registered with НАП (СУПТО). Document this boundary in the README.

---

## C. Running it as a paid service (former item 4)

### C1. Plans and limits
- Control DB: `plans` (name, monthly price, limits: users, items, locations, invoices per month, API
  access, integrations) and `subscriptions` (organization, plan, status trial/active/past_due/cancelled,
  period end). New organizations start with a 14-day trial.
- Enforce limits in `requireContext` / actions with a clear Bulgarian message and a link to upgrade;
  read-only mode (not deletion) when a subscription lapses; `/admin` shows plan and status per tenant.

### C2. Payments and our own invoices
- Card payments with Stripe Billing (subscriptions, customer portal, webhooks → subscription status) and
  bank transfer as an alternative for annual plans. Evaluate a Bulgarian provider (e.g. ePay, myPOS) only
  if clients ask.
- The platform issues its own invoices to tenants with the invoicing engine from B1 (run as the platform's
  company), emailed automatically after each payment.

### C3. Legal pages and data protection
- Общи условия, политика за поверителност, договор за обработване на лични данни (GDPR art. 28) and a
  cookie notice: pages on the root domain, acceptance recorded with version and date on registration.
- Hosting inside the EU stated on the site; organization deletion and full data export (ZIP with CSV + PDFs
  + photos) self-service for the owner, with a grace period before the database is dropped.

---

## D. Everyday use (former item 5)

### D1. Mobile scan mode (PWA)
- Installable PWA (manifest, icons, service worker) with a full-screen scan mode for receiving, picking,
  transfers and counts; large buttons, camera + Bluetooth scanner input, haptic/sound feedback.
- Offline queue for counts and movements recorded without signal, synced in order when online, conflicts
  shown to the user (never silently applied twice — idempotency key per queued action).

### D2. Reorder suggestions
- Per item: average daily consumption over N days, supplier lead time (`partners.lead_time_days` exists),
  safety stock → suggested order quantity. Page "За поръчка" grouped by supplier; one click creates draft
  purchase orders.

### D3. Multiple suppliers per item
- `item_suppliers` (supplier, supplier SKU, purchase price, minimum order quantity, lead time, preferred).
  Purchase orders prefill price and SKU; reorder suggestions use the preferred supplier.

### D4. Packaging units
- Per item: alternative units with a factor (кашон = 12 бр., палет = 48 кашона) and their own barcodes.
  Scanning a box barcode adds 12; orders and documents can use any unit and store the base quantity.

### D5. Help and onboarding content
- Help centre in Bulgarian (`/help` on the root domain): short articles and videos per workflow, context
  links ("?") from each page to the matching article.

---

## E. Integrations (former item 3)

Build each integration as a module under `src/lib/integrations/<name>/` with per-tenant encrypted credentials
(reuse `src/lib/crypto.ts`), a settings page, a log of calls, and retries. Add only what is enabled by the
plan (C1).

### E1. Couriers: Econt, Speedy, BOX NOW
- From an outbound shipment: create the waybill (sender office/address, receiver, COD amount, declared
  value, weight), print the label, store the tracking number; poll or receive status updates and move the
  shipment to `in_transit` / `delivered` automatically (delivery goes through `shipment-service.ts`).
- Offices and lockers lists cached and searchable in the shipment form; COD reconciliation report.

### E2. Online stores and marketplaces
- WooCommerce and Shopify: two-way sync — products/variants mapped by SKU, stock pushed on every movement
  (debounced), orders imported as sales orders. eMAG Marketplace: stock and order import.
- Conflict rule: Инвентар is the source of truth for stock; the store is the source for orders.

### E3. Accounting software
- Export / import formats for Microinvest Склад Pro, Ajur L and Плюс-Минус (verify each product's current
  import format with a real installation or the vendor's docs). Import from Microinvest Склад Pro for
  onboarding clients who switch (items, partners, opening stock).

### E4. SAF-T
- НАП is introducing SAF-T reporting in stages by company size. Check the current schedule and the
  official XSD; generate the stock (Physical Stock / Movement of Goods) section from movements with
  valuation from A4. Build only when the first client falls under it.

---

## Definition of done for phase 4
Each item: code, migration, tests, Bulgarian UI, PDFs where relevant, OpenAPI updated, verified in the
browser with DB state checked, `CLAUDE.md` roadmap updated, one Bulgarian commit.
