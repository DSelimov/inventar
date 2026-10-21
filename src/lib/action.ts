import "server-only";
import { cookies } from "next/headers";
import { redirect, unstable_rethrow } from "next/navigation";
import { UserError } from "./errors";
import { subscriptionState } from "./plans";
import { currentTenant } from "./tenant";

/** Резултат от server action за <Form>: грешка за показване до полетата или съобщение за успех (toast). */
export type ActionResult = { error?: string; ok?: string } | undefined;

/**
 * Обвива server action: UserError → { error }, върнат текст → { ok } (toast), redirect() минава.
 * При абонамент само за преглед действието се отказва (освен с allowReadOnly).
 * Неочакваните грешки се хвърлят нагоре (страница за грешка + лог).
 */
export function act<A extends unknown[]>(fn: (...args: A) => Promise<string | void>, o: { allowReadOnly?: boolean } = {}) {
  return async (...args: A): Promise<ActionResult> => {
    try {
      // изтекъл пробен период / неплатен абонамент: страниците се виждат, действията не минават
      // (освен вход, профил и парола — allowReadOnly)
      if (!o.allowReadOnly) {
        const org = await currentTenant();
        const sub = org ? subscriptionState(org) : null;
        if (sub?.readOnly) return { error: sub.message ?? "Абонаментът позволява само преглед." };
      }
      const ok = await fn(...args);
      return ok ? { ok } : undefined;
    } catch (e) {
      unstable_rethrow(e);
      if (e instanceof UserError) return { error: e.message };
      throw e;
    }
  };
}

export const FLASH_COOKIE = "inv_flash";

/** Пренасочва и показва съобщение (toast) на следващата страница. */
export async function redirectWith(url: string, message: string): Promise<never> {
  const jar = await cookies();
  jar.set(FLASH_COOKIE, encodeURIComponent(message), { path: "/", maxAge: 60, sameSite: "lax", httpOnly: false });
  redirect(url);
}
