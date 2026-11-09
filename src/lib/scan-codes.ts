/**
 * Разпознаване на сканиран код в браузъра (трансфер, приемане на пратка): баркод или код на артикула,
 * или баркод на опаковка (кашон, палет) — тогава количеството е факторът на опаковката.
 */
export type CodeItem = { id: number; sku: string; barcode: string | null };
export type CodeUnit = { itemId: number; name: string; factor: number; barcode: string | null };
export type CodeHit = { itemId: number; factor: number; pack: string | null };

export function buildCodeIndex(items: CodeItem[], units: CodeUnit[]) {
  const map = new Map<string, CodeHit>();
  const key = (c: string) => c.trim().toLocaleLowerCase("bg");
  // опаковките първо, за да не ги засенчи код на артикул със същата стойност
  for (const u of units) if (u.barcode) map.set(key(u.barcode), { itemId: u.itemId, factor: u.factor, pack: u.name });
  for (const i of items) {
    if (i.barcode) map.set(key(i.barcode), { itemId: i.id, factor: 1, pack: null });
    if (!map.has(key(i.sku))) map.set(key(i.sku), { itemId: i.id, factor: 1, pack: null });
  }
  return (code: string) => map.get(key(code)) ?? null;
}

/** Кратък звук: висок при успех, нисък при грешка (за работа със скенер, без да се гледа екранът). */
export function beep(ok: boolean) {
  try {
    const Ctx = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctx) return;
    const ctx = new Ctx();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.frequency.value = ok ? 1200 : 300;
    gain.gain.value = 0.08;
    osc.connect(gain).connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + (ok ? 0.08 : 0.25));
    osc.onended = () => void ctx.close();
  } catch {
    /* без звук */
  }
}
