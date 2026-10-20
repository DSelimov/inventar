import "server-only";
import { cookies } from "next/headers";
import { redirect, unstable_rethrow } from "next/navigation";
import { UserError } from "./errors";

/** Резултат от server action за <Form>: грешка за показване до полетата или съобщение за успех (toast). */
export type ActionResult = { error?: string; ok?: string } | undefined;

/**
 * Обвива server action: UserError → { error }, върнат текст → { ok } (toast), redirect() минава.
 * Неочакваните грешки се хвърлят нагоре (страница за грешка + лог).
 */
export function act<A extends unknown[]>(fn: (...args: A) => Promise<string | void>) {
  return async (...args: A): Promise<ActionResult> => {
    try {
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
