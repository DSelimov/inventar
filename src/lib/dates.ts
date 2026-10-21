/**
 * Календарни дни в часовата зона на фирмите (по подразбиране Europe/Sofia, APP_TIMEZONE) срещу
 * датите в базата, които са в UTC. Справките „към дата“ и „за период“ режат по местната полунощ.
 */
export const APP_TIMEZONE = process.env.APP_TIMEZONE || "Europe/Sofia";

/** Отместването на зоната спрямо UTC в милисекунди в момента t (+2 ч. зимно / +3 ч. лятно за София). */
function offsetMs(t: number, timeZone: string) {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-US", { timeZone, hourCycle: "h23", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit" })
      .formatToParts(new Date(t))
      .map((p) => [p.type, p.value]),
  );
  return Date.UTC(+parts.year, +parts.month - 1, +parts.day, +parts.hour, +parts.minute, +parts.second) - (t - (t % 1000));
}

/** Местната полунощ в началото на деня ГГГГ-ММ-ДД, като момент в UTC. */
export function startOfLocalDay(iso: string, timeZone = APP_TIMEZONE) {
  const [y, m, d] = iso.split("-").map(Number);
  const guess = Date.UTC(y, m - 1, d);
  // второто изчисление оправя дните на смяна на часа
  const first = guess - offsetMs(guess, timeZone);
  return new Date(guess - offsetMs(first, timeZone));
}

/** Местната полунощ след края на деня (за „до и включително“). */
export function endOfLocalDay(iso: string, timeZone = APP_TIMEZONE) {
  const [y, m, d] = iso.split("-").map(Number);
  const next = new Date(Date.UTC(y, m - 1, d + 1)).toISOString().slice(0, 10);
  return startOfLocalDay(next, timeZone);
}

/** Днешната дата ГГГГ-ММ-ДД в местната зона (сървърът може да е в UTC). */
export function localTodayIso(timeZone = APP_TIMEZONE, now = new Date()) {
  return new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).format(now);
}
