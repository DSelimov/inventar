"use server";

import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";
import { controlDb } from "@/db/control";
import { users } from "@/db/control-schema";
import { act } from "@/lib/action";
import { audit } from "@/lib/audit";
import { destroyOtherSessions, requireContext, verifyPassword } from "@/lib/auth";
import { decrypt, encrypt } from "@/lib/crypto";
import { UserError } from "@/lib/errors";
import { required, str } from "@/lib/forms";
import { log } from "@/lib/log";
import { generateRecoveryCodes, generateSecret, verifyTotp } from "@/lib/totp";

const RECOVERY_COOKIE = "inv_recovery_codes";

/** Кодовете за възстановяване се показват веднъж: кратък httpOnly cookie, прочетен от страницата на профила. */
async function showRecoveryCodesOnce(codes: string[]) {
  (await cookies()).set(RECOVERY_COOKIE, codes.join(","), { httpOnly: true, sameSite: "lax", maxAge: 120, path: "/profile" });
}

export async function readRecoveryCodesOnce() {
  return (await cookies()).get(RECOVERY_COOKIE)?.value.split(",") ?? null;
}

export const hideRecoveryCodes = act(async () => {
  (await cookies()).set(RECOVERY_COOKIE, "", { maxAge: 0, path: "/profile" });
  revalidatePath("/profile");
});

export const updateName = act(async (fd: FormData) => {
  const ctx = await requireContext("read");
  const name = required(str(fd, "name"), "Име").slice(0, 200);
  await controlDb.update(users).set({ name }).where(eq(users.id, ctx.user.id));
  revalidatePath("/", "layout");
  return "Името е запазено.";
});

/** Стъпка 1: нов секрет (още не е активен), показан като QR код. */
export const startTotpSetup = act(async () => {
  const ctx = await requireContext("read");
  if (ctx.user.totpEnabledAt) throw new UserError("Двуфакторната защита вече е включена.");
  await controlDb.update(users).set({ totpPendingEnc: encrypt(generateSecret()) }).where(eq(users.id, ctx.user.id));
  revalidatePath("/profile");
});

/** Стъпка 2: код от приложението потвърждава, че е настроено правилно. */
export const confirmTotpSetup = act(async (fd: FormData) => {
  const ctx = await requireContext("read");
  if (!ctx.user.totpPendingEnc) throw new UserError("Започнете настройката отначало.");
  const secret = decrypt(ctx.user.totpPendingEnc);
  const step = verifyTotp(secret, str(fd, "code"));
  if (step === null) throw new UserError("Кодът не съвпада. Проверете часа на телефона и въведете текущия код.");
  const { codes, hashes } = generateRecoveryCodes();
  await controlDb
    .update(users)
    .set({ totpSecretEnc: encrypt(secret), totpPendingEnc: null, totpEnabledAt: new Date(), totpLastStep: step, totpRecoveryHashes: hashes })
    .where(eq(users.id, ctx.user.id));
  await destroyOtherSessions(ctx.user.id);
  await showRecoveryCodesOnce(codes);
  log.info("auth.2fa_enabled", { userId: ctx.user.id });
  await audit(ctx, "2fa_enabled", "user", ctx.user.id);
  revalidatePath("/profile");
  return "Двуфакторната защита е включена. Запазете кодовете за възстановяване.";
});

export const cancelTotpSetup = act(async () => {
  const ctx = await requireContext("read");
  await controlDb.update(users).set({ totpPendingEnc: null }).where(eq(users.id, ctx.user.id));
  revalidatePath("/profile");
});

/** Изключване: изисква парола и текущ код (или код за възстановяване не се приема тук нарочно). */
export const disableTotp = act(async (fd: FormData) => {
  const ctx = await requireContext("read");
  if (!ctx.user.totpEnabledAt || !ctx.user.totpSecretEnc) throw new UserError("Двуфакторната защита не е включена.");
  if (!verifyPassword(str(fd, "password"), ctx.user.passwordHash)) throw new UserError("Грешна парола.");
  if (verifyTotp(decrypt(ctx.user.totpSecretEnc), str(fd, "code"), ctx.user.totpLastStep) === null) throw new UserError("Невалиден код от приложението.");
  await controlDb.update(users).set({ totpSecretEnc: null, totpPendingEnc: null, totpEnabledAt: null, totpLastStep: null, totpRecoveryHashes: null }).where(eq(users.id, ctx.user.id));
  log.warn("auth.2fa_disabled", { userId: ctx.user.id });
  await audit(ctx, "2fa_disabled", "user", ctx.user.id);
  revalidatePath("/profile");
  return "Двуфакторната защита е изключена.";
});

export const regenerateRecoveryCodes = act(async (fd: FormData) => {
  const ctx = await requireContext("read");
  if (!ctx.user.totpEnabledAt || !ctx.user.totpSecretEnc) throw new UserError("Двуфакторната защита не е включена.");
  if (!verifyPassword(str(fd, "password"), ctx.user.passwordHash)) throw new UserError("Грешна парола.");
  // вторият фактор е нужен и тук: само с парола и сесия новите кодове биха заобиколили 2FA
  const step = verifyTotp(decrypt(ctx.user.totpSecretEnc), str(fd, "code"), ctx.user.totpLastStep);
  if (step === null) throw new UserError("Невалиден код от приложението.");
  const { codes, hashes } = generateRecoveryCodes();
  await controlDb.update(users).set({ totpRecoveryHashes: hashes, totpLastStep: step }).where(eq(users.id, ctx.user.id));
  await showRecoveryCodesOnce(codes);
  await audit(ctx, "2fa_recovery_codes", "user", ctx.user.id);
  revalidatePath("/profile");
  return "Нови кодове за възстановяване — старите вече не важат.";
});
