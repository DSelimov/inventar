import "server-only";
import { desc, eq } from "drizzle-orm";
import type { Organization } from "@/db/control-schema";
import type { Db } from "@/db/tenant";
import { integrationLogs, integrations } from "@/db/tenant-schema";
import { decrypt, encrypt } from "../crypto";
import { UserError } from "../errors";
import { planOf } from "../plans";

/**
 * Общ слой за интеграциите: данни за достъп (криптирани), настройки, HTTP с таймаут и повторни опити
 * при мрежова грешка или 5xx, дневник на всяка заявка. Конкретните услуги са в couriers/ и shops/.
 */
export type ProviderId = "econt" | "speedy" | "boxnow" | "woocommerce" | "shopify";
export type Field = { key: string; label: string; secret?: boolean; hint?: string; placeholder?: string };
export type ProviderInfo = { id: ProviderId; name: string; kind: "courier" | "shop"; credentials: Field[]; settings: Field[]; docs: string };

export const PROVIDERS: Record<ProviderId, ProviderInfo> = {
  econt: {
    id: "econt",
    name: "Еконт",
    kind: "courier",
    docs: "https://ee.econt.com/services/",
    credentials: [
      { key: "username", label: "Потребител (e-Econt)" },
      { key: "password", label: "Парола", secret: true },
    ],
    settings: [
      { key: "demo", label: "Демо среда (demo.econt.com)", hint: "„да“ за тест; демо достъп: iasp-dev / 1Asp-dev", placeholder: "да" },
      { key: "senderOfficeCode", label: "Код на офиса за подаване", placeholder: "1127" },
      { key: "senderPhone", label: "Телефон на подателя", placeholder: "0888123456" },
      { key: "agentName", label: "Упълномощено лице (задължително за фирми)", placeholder: "Иван Петров" },
    ],
  },
  speedy: {
    id: "speedy",
    name: "Спиди",
    kind: "courier",
    docs: "https://api.speedy.bg/api/docs/",
    credentials: [
      { key: "username", label: "Потребител (API)" },
      { key: "password", label: "Парола", secret: true },
    ],
    settings: [
      { key: "dropoffOfficeId", label: "Офис за подаване (id)", hint: "Празно = вземане от адреса по договор", placeholder: "2" },
      { key: "senderPhone", label: "Телефон на подателя", placeholder: "0888123456" },
      { key: "contactName", label: "Лице за контакт", placeholder: "Иван Петров" },
      { key: "serviceId", label: "Услуга (serviceId)", placeholder: "505" },
      { key: "payer", label: "Платец на доставката", hint: "SENDER, RECIPIENT или THIRD_PARTY", placeholder: "RECIPIENT" },
    ],
  },
  boxnow: {
    id: "boxnow",
    name: "BOX NOW",
    kind: "courier",
    docs: "https://www.boxnow.bg/en/diy/eshops/api",
    credentials: [
      { key: "clientId", label: "Client ID" },
      { key: "clientSecret", label: "Client secret", secret: true },
    ],
    settings: [
      { key: "baseUrl", label: "Адрес на API", hint: "Предоставя се от BOX NOW (stage или production)", placeholder: "https://…" },
      { key: "originId", label: "Място на подаване (origin locationId)", placeholder: "2" },
      { key: "senderPhone", label: "Телефон на подателя", placeholder: "+359888123456" },
      { key: "senderEmail", label: "Имейл на подателя", placeholder: "sklad@firma.bg" },
    ],
  },
  woocommerce: {
    id: "woocommerce",
    name: "WooCommerce",
    kind: "shop",
    docs: "https://woocommerce.github.io/woocommerce-rest-api-docs/",
    credentials: [
      { key: "consumerKey", label: "Consumer key", placeholder: "ck_…" },
      { key: "consumerSecret", label: "Consumer secret", secret: true, placeholder: "cs_…" },
    ],
    settings: [
      { key: "url", label: "Адрес на магазина", placeholder: "https://magazin.bg" },
      { key: "locationId", label: "Локация, чиято наличност се показва (id)", hint: "Празно = общата наличност" },
      { key: "importStatuses", label: "Статуси на поръчките за внос", placeholder: "processing" },
    ],
  },
  shopify: {
    id: "shopify",
    name: "Shopify",
    kind: "shop",
    docs: "https://shopify.dev/docs/api/admin-graphql",
    credentials: [{ key: "accessToken", label: "Admin API access token", secret: true, placeholder: "shpat_…" }],
    settings: [
      { key: "shop", label: "Магазин", placeholder: "magazin.myshopify.com" },
      { key: "shopifyLocationId", label: "Shopify location (gid)", placeholder: "gid://shopify/Location/123" },
      { key: "locationId", label: "Локация, чиято наличност се изпраща (id)", hint: "Празно = общата наличност" },
    ],
  },
};

export type IntegrationConfig = { enabled: boolean; credentials: Record<string, string>; settings: Record<string, string>; lastSyncAt: Date | null };

export async function getIntegration(db: Db, provider: ProviderId): Promise<IntegrationConfig> {
  const [row] = await db.select().from(integrations).where(eq(integrations.provider, provider));
  if (!row) return { enabled: false, credentials: {}, settings: {}, lastSyncAt: null };
  return {
    enabled: row.enabled,
    credentials: row.credentialsEnc ? (JSON.parse(decrypt(row.credentialsEnc)) as Record<string, string>) : {},
    settings: (row.settings ?? {}) as Record<string, string>,
    lastSyncAt: row.lastSyncAt,
  };
}

/** Записва настройките; празно поле за тайна = старата стойност остава. */
export async function saveIntegration(db: Db, provider: ProviderId, input: { enabled: boolean; credentials: Record<string, string>; settings: Record<string, string> }) {
  const current = await getIntegration(db, provider);
  const credentials = { ...current.credentials };
  for (const f of PROVIDERS[provider].credentials) if (input.credentials[f.key] || !f.secret) credentials[f.key] = input.credentials[f.key] ?? "";
  const values = { enabled: input.enabled, credentialsEnc: encrypt(JSON.stringify(credentials)), settings: input.settings, updatedAt: new Date() };
  await db.insert(integrations).values({ provider, ...values }).onDuplicateKeyUpdate({ set: values });
}

export async function markSynced(db: Db, provider: ProviderId) {
  await db.update(integrations).set({ lastSyncAt: new Date() }).where(eq(integrations.provider, provider));
}

/** Интеграциите са включени в плана (лимит „Интеграции“). Без план — без ограничение. */
export async function assertIntegrationsAllowed(org: Organization) {
  const plan = await planOf(org);
  if (plan && !plan.integrations) throw new UserError(`Планът „${plan.name}“ не включва интеграции с куриери и магазини. Вижте Настройки › Абонамент.`);
}

export async function requireEnabled(db: Db, provider: ProviderId) {
  const cfg = await getIntegration(db, provider);
  if (!cfg.enabled) throw new UserError(`Интеграцията с ${PROVIDERS[provider].name} не е включена (Настройки › Интеграции).`);
  return cfg;
}

export type HttpResult = { status: number; body: unknown; bytes?: Buffer };

/**
 * HTTP заявка с таймаут; повтаря до 3 пъти при мрежова грешка или 502/503/504 (0,5 с, после 1,5 с).
 * Всеки опит се записва в integration_logs (без телата — там може да има лични данни).
 */
export async function http(db: Db, provider: ProviderId, action: string, url: string, init: RequestInit & { timeoutMs?: number; binary?: boolean } = {}): Promise<HttpResult> {
  const delays = [500, 1500];
  for (let attempt = 0; ; attempt++) {
    const started = Date.now();
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), init.timeoutMs ?? 20_000);
    try {
      const res = await fetch(url, { ...init, signal: ctrl.signal });
      const status = res.status;
      let body: unknown = null;
      let bytes: Buffer | undefined;
      if (init.binary && res.ok) bytes = Buffer.from(await res.arrayBuffer());
      else {
        const text = await res.text();
        try {
          body = text ? JSON.parse(text) : null;
        } catch {
          body = text;
        }
      }
      // само временни грешки на сървъра (Еконт връща грешки при валидация като 517 — те не се повтарят)
      if ([502, 503, 504].includes(status) && attempt < delays.length) {
        await log(db, provider, action, false, status, `HTTP ${status}, нов опит`, Date.now() - started);
        await new Promise((r) => setTimeout(r, delays[attempt]));
        continue;
      }
      await log(db, provider, action, status < 400, status, status < 400 ? null : summarize(body), Date.now() - started);
      return { status, body, bytes };
    } catch (e) {
      const message = (e as Error).name === "AbortError" ? "Изтече времето за отговор" : (e as Error).message;
      await log(db, provider, action, false, null, message, Date.now() - started);
      if (attempt < delays.length) {
        await new Promise((r) => setTimeout(r, delays[attempt]));
        continue;
      }
      throw new UserError(`${PROVIDERS[provider].name} не отговаря: ${message}`);
    } finally {
      clearTimeout(timer);
    }
  }
}

const summarize = (body: unknown) => (typeof body === "string" ? body : JSON.stringify(body ?? "")).slice(0, 1000);

async function log(db: Db, provider: ProviderId, action: string, ok: boolean, httpStatus: number | null, message: string | null, durationMs: number) {
  try {
    await db.insert(integrationLogs).values({ provider, action, ok, httpStatus, message, durationMs });
  } catch {
    /* дневникът не бива да проваля самата операция */
  }
}

export async function recentLogs(db: Db, provider: ProviderId, limit = 20) {
  return db.select().from(integrationLogs).where(eq(integrationLogs.provider, provider)).orderBy(desc(integrationLogs.id)).limit(limit);
}
