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
- **Done.** Money columns are `decimal(14,4)` via the `money()` column helper in `tenant-schema.ts`
  (Drizzle `mode: "number"`). All arithmetic goes through `src/lib/money.ts` (`lineTotal`, `sumLines`,
  `sumMoney`, `roundMoney`, `parseMoney`) on whole ten-thousandths, rounding half away from zero to cents;
  `tests/unit/money.test.ts` fails if `… * unitCost/unitPrice` appears in JS outside that module. Every new
  money column (VAT, invoices, movement cost) uses `money()` and these helpers.
- API keeps amounts as JSON numbers (no breaking change); inputs with more than 4 decimals are rounded,
  negative or invalid ones are rejected. Document totals as `decimal(14,2)` come with B1.
- Acceptance: 0.1 + 0.2 style sums are exact in reports, PDFs and API; the existing test suite passes.

### A2. Fractional quantities and units of measure
- **Done.** Quantities are `decimal(14,3)` via the `qty()` column helper (items, stock levels, lots,
  movements, order/shipment/count lines); `items.quantity_decimals` (0–3) per item, serial items always 0.
  Arithmetic and validation in `src/lib/quantity.ts` (`addQty`, `subQty`, `sumQty`, `parseQuantity`,
  `itemDecimals`); `applyMovement` and `assertItemQuantities` reject quantities with more decimals than the
  item allows. Lowering an item's decimals is refused while stock or order lines use them
  (`assertFitsDecimals`). CSV import infers decimals for new items from the file. Scanning still adds the
  entered quantity (default 1).
- Acceptance: receive 12.5 кг, sell 0.750 кг, count 11.750 кг — all exact; tests in `tests/db/stock.test.ts`.

### A3. Euro and the лев history
- **Done.** `convertTenantToEuro` (`src/lib/euro.ts`) converts a BGN tenant at 1 EUR = 1.95583 BGN in one
  transaction: selling prices and sales-order prices to the cent, costs and purchase-order prices to 4
  decimals (`bgnToEur` in `src/lib/currency.ts`, exact BigInt arithmetic). Orders keep `original_currency`
  and each line `original_unit_price`; the order page and the delivery-note PDF show "издадена за … лв.".
  A primary-key marker in `settings` (`currency.euroConvertedAt`) makes it run once, also under concurrent
  calls; the control-DB currency is switched afterwards (a rerun finishes an interrupted switch). Audit
  entry `currency`.
- Run it with `pnpm db:euro [--dry-run] [subdomain…]` for every BGN tenant, or by the owner from
  Настройки (button shown only while the currency is BGN).
- Currency is a select of `CURRENCIES` (EUR first); changing it is refused once the tenant has prices or
  orders, because amounts are not recalculated.

### A4. Cost on every movement and stock valuation
- **Done.** `stock_movements.unit_cost` / `value` (existing rows backfilled with the item's cost);
  `applyMovement` locks the item row and costs every movement via `costMovement` in `src/lib/valuation.ts`.
  Methods per tenant (`settings.valuationMethod`, chosen in Настройки before the first movement):
  weighted average (default) and FIFO (`cost_layers`). Receipts take the cost from the shipment line
  (`shipment_lines.unit_cost`, new column in the inbound form), else the purchase-order line, else the
  current average; manual receipts and `POST /movements` accept `unitCost`. Customer returns come back at
  the cost they left with, supplier returns go out at the cost they came in with (FIFO: from that order's
  layers). Transfers keep the value. `items.unit_cost` is the running average (read-only while in stock).
- Reports: `/reports/valuation` — stock value at a date (sum of movement values to the end of the local
  day, `src/lib/dates.ts`), cost of goods sold and gross margin per item and per customer for a period
  (`src/lib/valuation-reports.ts`); `/print/stock?date=` prints the valuation at a date.
- Not yet: specific identification per lot, changing the method for a tenant with history.

### A5. VAT on lines
- **Done.** `vat_rates` per tenant, seeded by migration 0008 with 20 % (default), 9 %, 0 % intra-EU
  (чл. 53, ал. 1 ЗДДС), 0 % export (чл. 28 ЗДДС) and "без ДДС" for non-registered sellers (чл. 113, ал. 9
  ЗДДС) — names, rates and legal bases are editable in Настройки › ДДС; 0 % requires a legal basis. Rates
  checked in October 2026: 20 % standard, 9 % reduced (accommodation, certain books, baby products);
  restaurants and bread are back at 20 % since 2025.
- Default rate per item and per category (`vat_rate_id`); `assignVat` (`src/lib/vat-rates.ts`) resolves
  line → item → category → default. Order lines keep a snapshot (`vat_rate`); amounts are computed with
  `lineAmounts` / `orderVat` (`src/lib/vat.ts`, rounded per line) so they never go stale; each order keeps
  `prices_include_vat` from the tenant setting at creation. Order form has a VAT column and live totals;
  order page and delivery-note PDF show base, VAT per rate (with legal basis at 0 %) and total with VAT.
- Partners: `eik`, `vat_number`, `vat_registered`, `country` (migration splits old values);
  format checks in `src/lib/tax-ids.ts` (checksum and VIES come with B2).

### A6. Missing warehouse documents
- **Done.** Протокол за брак: `write_offs` / `write_off_lines` (migration 0009), pages `/write-offs`
  (list, new, detail), PDF `/print/write-offs/[id]` with commission and МОЛ signature lines. Draft →
  "Приложи" (role delete) books a new movement type `write_off` at cost (average or FIFO) and stores the
  value on each line; status is claimed atomically, so it applies once. Tracked items need a lot from the
  location. Write-offs are not sales: the turnover report keeps counting only `out`.
- The receipt note (Приемателен протокол) and the delivery note (Стокова разписка) already print with
  prices and VAT totals (A5).
- Numbering: `document_counters` + `nextNumber` / `peekNumber` (`src/lib/numbering.ts`) — per type and
  year (ПЗ, ПР, ИНВ, БР), `INSERT … ON DUPLICATE KEY UPDATE last_number = LAST_INSERT_ID(…)` inside the
  document's transaction, so concurrent documents never share a number and a rollback leaves no gap.
  Counters continue from the highest existing number; the order form shows the next number without
  taking it. Invoices (B1) use the same counter with their own 10-digit format.

---

## B. Invoicing

### B1. Invoices, credit and debit notes
- **Done.** `invoices`, `invoice_lines`, `invoice_payments` (migration 0010); engine `src/lib/invoicing.ts`,
  PDF `src/lib/invoice-pdf.ts`, pages `/invoices` (filters, paging, numbering card) and `/invoices/[id]`
  (draft editor / issued view), `/print/invoices/[id]` (?copy=1).
- Kinds: фактура, кредитно и дебитно известие (same 10-digit series, Arabic numerals only — чл. 114,
  ал. 1, т. 2 ЗДДС, checked October 2026), проформа (own ПФ-ГГГГ-NNN series, "не е данъчен документ").
  The series continues across years; "Номерация" lets a company continue from its previous software before
  the first issued invoice.
- Issuing: number taken in the transaction; snapshot of supplier (company details incl. new bank / IBAN)
  and recipient (partner ЕИК, ДДС №, address); line amounts and totals stored and frozen. Checks: company
  name/ЕИК/address, recipient and address, legal basis at 0 %, a non-VAT-registered company cannot charge
  VAT, notes need the related issued invoice and a reason. Cancellation keeps the number.
- From a sales order (button "Фактура" / "Проформа"): delivered − returned − already invoiced, or ordered
  if nothing is delivered; credit/debit notes start from the invoice's lines. Credit notes reduce the
  amount due; payments set unpaid / partial / paid; overdue invoices appear in the bell, on
  /notifications and in the daily digest. Email sends the PDF as an attachment.
- API: `GET /api/v1/invoices`, `GET /api/v1/invoices/{id}`, `POST /api/v1/orders/{id}/invoice`; webhooks
  `invoice.issued`, `invoice.paid`.
- Not yet: amount in words, several series by location, documents in a currency other than the tenant's.

### B2. Partner data lookup
- **Done.** Check digit for ЕИК (9 and 13 digits) and ЕГН (10) in `validEik` (`src/lib/tax-ids.ts`), used
  for partners and for the company's own details; BG ДДС numbers must be BG + a valid ЕИК/ЕГН.
- VIES (`src/lib/vies.ts`, public REST API of the European Commission): result cached in `vies_checks` for
  7 days, 6 s timeout, "VIES не отговаря" with the last known result instead of an error; Greece is EL.
  Partner page: badge and "Провери във VIES" (stores `vies_valid`, fills an empty address from VIES).
- Търговски регистър: no free official API — not implemented; VIES already returns name and address for
  VAT-registered companies.

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
