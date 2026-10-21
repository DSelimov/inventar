/**
 * КОНТРОЛНА БАЗА: общи неща за цялата инсталация — организации (клиенти), потребители,
 * членства, сесии и пул от предварително създадени бази. Данните на всеки клиент са в
 * отделна база (tenant-schema.ts).
 */
import { relations, sql } from "drizzle-orm";
import { boolean, date, datetime, decimal, index, int, json, mysqlEnum, mysqlTable, text, uniqueIndex, varchar } from "drizzle-orm/mysql-core";

export const ROLES = ["owner", "admin", "manager", "staff", "viewer"] as const;
export type Role = (typeof ROLES)[number];

export const ORG_STATUSES = ["provisioning", "active", "suspended", "failed"] as const;
export type OrgStatus = (typeof ORG_STATUSES)[number];

const createdAt = () => datetime("created_at", { fsp: 3 }).notNull().default(sql`CURRENT_TIMESTAMP(3)`);

export const SUBSCRIPTION_STATUSES = ["trial", "active", "past_due", "cancelled"] as const;
export type SubscriptionStatus = (typeof SUBSCRIPTION_STATUSES)[number];

/** Абонаментни планове: цени и лимити се редактират в /admin/plans; празен лимит = без ограничение. */
export const plans = mysqlTable("plans", {
  id: int("id").autoincrement().primaryKey(),
  code: varchar("code", { length: 32 }).notNull().unique(),
  name: varchar("name", { length: 100 }).notNull(),
  monthlyPrice: decimal("monthly_price", { precision: 10, scale: 2, mode: "number" }).notNull().default(0),
  currency: varchar("currency", { length: 3 }).notNull().default("EUR"),
  maxUsers: int("max_users"),
  maxItems: int("max_items"),
  maxLocations: int("max_locations"),
  maxInvoicesPerMonth: int("max_invoices_per_month"),
  apiAccess: boolean("api_access").notNull().default(false),
  integrations: boolean("integrations").notNull().default(false),
  description: varchar("description", { length: 500 }),
  active: boolean("active").notNull().default(true),
  sortOrder: int("sort_order").notNull().default(0),
});

export const organizations = mysqlTable("organizations", {
  id: int("id").autoincrement().primaryKey(),
  name: varchar("name", { length: 200 }).notNull(),
  /** Поддомейн: <subdomain>.APP_DOMAIN. Малки латински букви, цифри и тире. */
  subdomain: varchar("subdomain", { length: 63 }).notNull().unique(),
  currency: varchar("currency", { length: 3 }).notNull().default("EUR"),
  status: mysqlEnum("status", ORG_STATUSES).notNull().default("provisioning"),
  /** Връзка към базата на клиента. Ако host/user са празни, се ползва TENANT_DB_ADMIN_URL. */
  dbName: varchar("db_name", { length: 64 }).notNull(),
  dbHost: varchar("db_host", { length: 255 }),
  dbPort: int("db_port"),
  dbUser: varchar("db_user", { length: 64 }),
  /** AES-256-GCM, ключ от APP_SECRET. */
  dbPasswordEnc: text("db_password_enc"),
  /** Абонамент: план, статус, край на пробния период и платено до (докато няма онлайн плащане — ръчно в /admin). */
  planId: int("plan_id").references(() => plans.id, { onDelete: "set null" }),
  subscriptionStatus: mysqlEnum("subscription_status", SUBSCRIPTION_STATUSES).notNull().default("trial"),
  trialEndsAt: datetime("trial_ends_at", { fsp: 3 }),
  paidUntil: datetime("paid_until", { fsp: 3 }),
  /** Заявено изтриване от собственика: данните се изтриват след DELETION_GRACE_DAYS (pnpm orgs:purge). */
  deletionRequestedAt: datetime("deletion_requested_at", { fsp: 3 }),
  deletionRequestedBy: varchar("deletion_requested_by", { length: 255 }),
  createdAt: createdAt(),
});

export const users = mysqlTable("users", {
  id: int("id").autoincrement().primaryKey(),
  email: varchar("email", { length: 255 }).notNull().unique(),
  name: varchar("name", { length: 200 }).notNull(),
  passwordHash: varchar("password_hash", { length: 255 }).notNull(),
  /** Може да създава организации от началната страница. */
  canCreateOrganizations: boolean("can_create_organizations").notNull().default(true),
  /** Администратор на платформата: /admin на основния домейн (всички организации, пул от бази). */
  isPlatformAdmin: boolean("is_platform_admin").notNull().default(false),
  /** Двуфакторна автентикация (TOTP): секретът е криптиран с APP_SECRET. */
  totpSecretEnc: text("totp_secret_enc"),
  /** Секрет по време на настройката, преди потвърждаване с код. */
  totpPendingEnc: text("totp_pending_enc"),
  totpEnabledAt: datetime("totp_enabled_at", { fsp: 3 }),
  /** Последната използвана 30-секундна стъпка — един код не се приема два пъти. */
  totpLastStep: int("totp_last_step"),
  /** sha256 на неизползваните кодове за възстановяване. */
  totpRecoveryHashes: json("totp_recovery_hashes").$type<string[]>(),
  /** Версия и дата на приетите Общи условия и Политика за поверителност (при регистрация). */
  termsVersion: varchar("terms_version", { length: 32 }),
  termsAcceptedAt: datetime("terms_accepted_at", { fsp: 3 }),
  createdAt: createdAt(),
});

export const memberships = mysqlTable(
  "memberships",
  {
    id: int("id").autoincrement().primaryKey(),
    userId: int("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    organizationId: int("organization_id").notNull().references(() => organizations.id, { onDelete: "cascade" }),
    role: mysqlEnum("role", ROLES).notNull().default("staff"),
    /** Дневен имейл с известия (за мениджър и нагоре). */
    emailDigest: boolean("email_digest").notNull().default(true),
    /** Последна дата на изпратен дневен имейл — не се изпраща два пъти в един ден. */
    digestSentOn: date("digest_sent_on", { mode: "string" }),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex("memberships_user_org").on(t.userId, t.organizationId)],
);

export const sessions = mysqlTable("sessions", {
  /** sha256 на cookie токена */
  id: varchar("id", { length: 64 }).primaryKey(),
  userId: int("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  organizationId: int("organization_id").references(() => organizations.id, { onDelete: "set null" }),
  expiresAt: datetime("expires_at", { fsp: 3 }).notNull(),
  createdAt: createdAt(),
});

export const PASSWORD_TOKEN_PURPOSES = ["reset", "invite"] as const;

/** Еднократни линкове за нова парола (reset, 1 час) и покани (invite, 7 дни). */
export const passwordResets = mysqlTable(
  "password_resets",
  {
    /** sha256 на токена от линка */
    id: varchar("id", { length: 64 }).primaryKey(),
    userId: int("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    purpose: mysqlEnum("purpose", PASSWORD_TOKEN_PURPOSES).notNull().default("reset"),
    /** Организацията, от чийто поддомейн е заявката/поканата — за връщане там след смяната. */
    organizationId: int("organization_id").references(() => organizations.id, { onDelete: "set null" }),
    expiresAt: datetime("expires_at", { fsp: 3 }).notNull(),
    usedAt: datetime("used_at", { fsp: 3 }),
    createdAt: createdAt(),
  },
  (t) => [index("password_resets_user").on(t.userId)],
);

/** Броячи за ограничаване на опити (вход, забравена парола): фиксиран прозорец по ключ. */
export const rateLimits = mysqlTable("rate_limits", {
  /** напр. login:email:ivan@firma.bg, login:ip:1.2.3.4 */
  key: varchar("key", { length: 191 }).primaryKey(),
  hits: int("hits").notNull().default(0),
  windowStart: datetime("window_start", { fsp: 3 }).notNull(),
});

/** Предварително създадени бази (режим manual, напр. споделен хостинг). */
export const databasePool = mysqlTable("database_pool", {
  id: int("id").autoincrement().primaryKey(),
  dbName: varchar("db_name", { length: 64 }).notNull().unique(),
  dbHost: varchar("db_host", { length: 255 }).notNull(),
  dbPort: int("db_port").notNull().default(3306),
  dbUser: varchar("db_user", { length: 64 }).notNull(),
  dbPasswordEnc: text("db_password_enc").notNull(),
  assignedOrganizationId: int("assigned_organization_id"),
  createdAt: createdAt(),
});

export const organizationsRelations = relations(organizations, ({ many }) => ({ memberships: many(memberships) }));
export const usersRelations = relations(users, ({ many }) => ({ memberships: many(memberships) }));
export const membershipsRelations = relations(memberships, ({ one }) => ({
  user: one(users, { fields: [memberships.userId], references: [users.id] }),
  organization: one(organizations, { fields: [memberships.organizationId], references: [organizations.id] }),
}));

export type Organization = typeof organizations.$inferSelect;
export type User = typeof users.$inferSelect;
export type Membership = typeof memberships.$inferSelect;
export type PasswordReset = typeof passwordResets.$inferSelect;

export type Plan = typeof plans.$inferSelect;
