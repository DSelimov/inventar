"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { ArrowDownToLine, ArrowUpFromLine, ClipboardCheck, RefreshCw, Wifi, WifiOff } from "lucide-react";
import { Scanner } from "@/components/scan/scanner";
import { Button } from "@/components/ui/button";
import { Input, Select } from "@/components/ui/fields";
import { mulQty } from "@/lib/quantity";
import { cn, formatNumber } from "@/lib/utils";

type CatalogItem = { id: number; sku: string; barcode: string | null; name: string; variantLabel: string | null; unit: string; quantityDecimals: number; tracking: string; quantity: number };
type Catalog = { items: CatalogItem[]; packs: Array<{ itemId: number; name: string; factor: number; barcode: string | null }>; locations: Array<{ id: number; name: string; isDefault: boolean }>; counts: Array<{ id: number; number: string; locationId: number }>; at: string };
type Mode = "in" | "out" | "count";
type QueuedAction = { id: string; kind: "movement" | "count"; recordedAt: string; payload: Record<string, unknown>; label: string };
type LogLine = { id: string; label: string; ok: boolean | null; message: string };

const CATALOG_KEY = "inv_m_catalog";
const QUEUE_KEY = "inv_m_queue";

// localStorage може да липсва (частен режим) — тогава работим само в паметта
const load = <T,>(key: string, fallback: T): T => {
  try {
    const v = localStorage.getItem(key);
    return v ? (JSON.parse(v) as T) : fallback;
  } catch {
    return fallback;
  }
};
const save = (key: string, value: unknown) => {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* без хранилище */
  }
};

function feedback(ok: boolean) {
  try {
    navigator.vibrate?.(ok ? 40 : [80, 60, 80]);
    const ctx = new AudioContext();
    const osc = ctx.createOscillator();
    osc.frequency.value = ok ? 880 : 220;
    osc.connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + 0.08);
  } catch {
    /* без звук */
  }
}

/**
 * Мобилен режим: голям скенер за приход, разход и броене. Каталогът се пази на телефона, а действията —
 * в опашка, която се изпраща при връзка (всяко с UUID, затова повторното изпращане не дублира движения).
 */
export function MobileScan({ orgName }: { orgName: string }) {
  // компонентът се рендерира само в браузъра (MobileScanLoader), затова хранилището се чете още при създаване
  const [catalog, setCatalog] = useState<Catalog | null>(() => load<Catalog | null>(CATALOG_KEY, null));
  const [queue, setQueue] = useState<QueuedAction[]>(() => load<QueuedAction[]>(QUEUE_KEY, []));
  const [log, setLog] = useState<LogLine[]>([]);
  const [online, setOnline] = useState(() => navigator.onLine);
  const [mode, setMode] = useState<Mode>("out");
  const [pickedLocation, setLocationId] = useState("");
  const [pickedCount, setCountId] = useState("");
  const locationId = pickedLocation || String(catalog?.locations.find((l) => l.isDefault)?.id ?? catalog?.locations[0]?.id ?? "");
  const countId = pickedCount || String(catalog?.counts[0]?.id ?? "");
  const [quantity, setQuantity] = useState("1");
  const [manual, setManual] = useState("");
  const syncing = useRef(false);

  const refreshCatalog = useCallback(async () => {
    try {
      const res = await fetch("/api/m/catalog", { cache: "no-store" });
      if (!res.ok) throw new Error(String(res.status));
      const c = (await res.json()) as Catalog;
      setCatalog(c);
      save(CATALOG_KEY, c);
    } catch {
      /* офлайн — остава кешираният каталог */
    }
  }, []);

  const sync = useCallback(async () => {
    if (syncing.current || !navigator.onLine) return;
    const pending = load<QueuedAction[]>(QUEUE_KEY, []);
    if (!pending.length) return;
    syncing.current = true;
    try {
      const res = await fetch("/api/m/sync", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ actions: pending.map((a) => ({ id: a.id, kind: a.kind, recordedAt: a.recordedAt, payload: a.payload })) }) });
      const body = (await res.json()) as { results?: Array<{ id: string; ok: boolean; message: string }>; error?: string };
      if (!res.ok || !body.results) {
        setLog((l) => [{ id: crypto.randomUUID(), label: "Синхронизация", ok: false, message: body.error ?? `Грешка ${res.status}` }, ...l].slice(0, 50));
        return;
      }
      const done = new Map(body.results.map((r) => [r.id, r]));
      const left = load<QueuedAction[]>(QUEUE_KEY, []).filter((a) => !done.has(a.id));
      save(QUEUE_KEY, left);
      setQueue(left);
      setLog((l) => l.map((line) => (done.has(line.id) ? { ...line, ok: done.get(line.id)!.ok, message: done.get(line.id)!.message } : line)));
      if (body.results.some((r) => !r.ok)) feedback(false);
      void refreshCatalog();
    } catch {
      /* без връзка — ще опитаме пак */
    } finally {
      syncing.current = false;
    }
  }, [refreshCatalog]);

  useEffect(() => {
    // първо зареждане на каталога и опит за изпращане — от таймер, за да не се обновява състоянието в самия ефект
    const first = setTimeout(() => void refreshCatalog().then(() => void sync()), 0);
    const up = () => {
      setOnline(true);
      void sync();
    };
    const down = () => setOnline(false);
    window.addEventListener("online", up);
    window.addEventListener("offline", down);
    const timer = setInterval(() => void sync(), 15_000);
    if ("serviceWorker" in navigator && process.env.NODE_ENV === "production") void navigator.serviceWorker.register("/sw.js").catch(() => {});
    return () => {
      clearTimeout(first);
      window.removeEventListener("online", up);
      window.removeEventListener("offline", down);
      clearInterval(timer);
    };
  }, [refreshCatalog, sync]);

  const enqueue = (code: string) => {
    const c = catalog;
    const key = code.trim().toLowerCase();
    if (!c || !key) return;
    const pack = c.packs.find((p) => p.barcode?.toLowerCase() === key);
    const item = c.items.find((i) => (pack ? i.id === pack.itemId : i.barcode?.toLowerCase() === key || i.sku.toLowerCase() === key));
    const qty = Number(quantity.replace(",", ".")) || 1;
    const fail = (message: string) => {
      feedback(false);
      setLog((l) => [{ id: crypto.randomUUID(), label: code, ok: false, message }, ...l].slice(0, 50));
    };
    if (!item && mode !== "count") return fail("Няма такъв артикул в каталога.");
    if (item && item.tracking !== "none" && mode !== "count") return fail(`„${item.name}“ е с партиди — направете движението от пълния режим.`);
    if (mode === "count" && !countId) return fail("Няма отворена инвентаризация.");
    const base = pack ? mulQty(qty, pack.factor) : qty;
    const name = item ? (item.variantLabel ? `${item.name} · ${item.variantLabel}` : item.name) : code;
    const action: QueuedAction =
      mode === "count"
        ? { id: crypto.randomUUID(), kind: "count", recordedAt: new Date().toISOString(), payload: { countId: Number(countId), code, quantity: qty }, label: `Броене: ${name} +${formatNumber(pack ? base : qty)}` }
        : { id: crypto.randomUUID(), kind: "movement", recordedAt: new Date().toISOString(), payload: { itemId: item!.id, locationId: Number(locationId), type: mode, quantity: base }, label: `${mode === "in" ? "Приход" : "Разход"}: ${name} ${mode === "in" ? "+" : "−"}${formatNumber(base)} ${item!.unit}` };
    const next = [...load<QueuedAction[]>(QUEUE_KEY, []), action];
    save(QUEUE_KEY, next);
    setQueue(next);
    setLog((l) => [{ id: action.id, label: action.label, ok: null, message: navigator.onLine ? "изпраща се…" : "в опашката (без връзка)" }, ...l].slice(0, 50));
    feedback(true);
    void sync();
  };

  const modes: Array<{ key: Mode; label: string; icon: typeof ArrowDownToLine; tone: string }> = [
    { key: "in", label: "Приход", icon: ArrowDownToLine, tone: "bg-success text-white" },
    { key: "out", label: "Разход", icon: ArrowUpFromLine, tone: "bg-danger text-white" },
    { key: "count", label: "Броене", icon: ClipboardCheck, tone: "bg-accent text-white" },
  ];

  return (
    <div className="mx-auto flex min-h-screen max-w-lg flex-col gap-4 p-4">
      <header className="flex items-center justify-between gap-2">
        <div>
          <div className="text-sm font-semibold">{orgName}</div>
          <Link href="/" className="text-xs text-muted hover:text-accent">
            ← пълен режим
          </Link>
        </div>
        <div className="flex items-center gap-2 text-xs">
          <span className={cn("flex items-center gap-1 rounded-full px-2 py-1", online ? "bg-success-soft text-success" : "bg-warning-soft text-warning")}>
            {online ? <Wifi className="h-3.5 w-3.5" /> : <WifiOff className="h-3.5 w-3.5" />}
            {online ? "онлайн" : "офлайн"}
          </span>
          {queue.length > 0 && <span className="rounded-full bg-warning-soft px-2 py-1 text-warning">{queue.length} в опашката</span>}
          <Button variant="ghost" size="sm" onClick={() => void refreshCatalog().then(() => void sync())} aria-label="Обнови каталога">
            <RefreshCw className="h-4 w-4" />
          </Button>
        </div>
      </header>

      <div className="grid grid-cols-3 gap-2">
        {modes.map((m) => (
          <button key={m.key} type="button" onClick={() => setMode(m.key)} className={cn("flex flex-col items-center gap-1 rounded-2xl py-4 text-sm font-semibold transition", mode === m.key ? m.tone : "bg-surface text-muted ring-1 ring-line")}>
            <m.icon className="h-6 w-6" />
            {m.label}
          </button>
        ))}
      </div>

      <div className="grid grid-cols-[1fr_6rem] gap-2">
        {mode === "count" ? (
          <Select value={countId} onChange={(e) => setCountId(e.target.value)} aria-label="Инвентаризация" className="h-12">
            {!catalog?.counts.length && <option value="">Няма отворена инвентаризация</option>}
            {catalog?.counts.map((c) => (
              <option key={c.id} value={c.id}>
                {c.number} · {catalog.locations.find((l) => l.id === c.locationId)?.name}
              </option>
            ))}
          </Select>
        ) : (
          <Select value={locationId} onChange={(e) => setLocationId(e.target.value)} aria-label="Локация" className="h-12">
            {catalog?.locations.map((l) => (
              <option key={l.id} value={l.id}>
                {l.name}
              </option>
            ))}
          </Select>
        )}
        <Input value={quantity} onChange={(e) => setQuantity(e.target.value)} inputMode="decimal" aria-label="Количество" className="h-12 text-center text-lg font-semibold" />
      </div>

      <div className="rounded-2xl bg-surface p-3 ring-1 ring-line">
        <Scanner continuous hideInput onCode={enqueue} />
        {/* Bluetooth/USB скенерът пише като клавиатура и завършва с Enter */}
        <form
          onSubmit={(e) => {
            e.preventDefault();
            enqueue(manual);
            setManual("");
          }}
          className="mt-3"
        >
          <Input value={manual} onChange={(e) => setManual(e.target.value)} placeholder="Баркод от скенер или ръчно…" className="h-12 font-mono" autoFocus autoComplete="off" enterKeyHint="go" />
        </form>
      </div>

      {!catalog && <p className="text-center text-sm text-muted">Зарежда се каталогът…</p>}
      {catalog && <p className="text-center text-[11px] text-muted">Каталог: {catalog.items.length} артикула, обновен {new Date(catalog.at).toLocaleString("bg-BG")}</p>}

      <ul className="space-y-1.5">
        {log.map((l) => (
          <li key={l.id} className={cn("rounded-xl px-3 py-2 text-sm", l.ok === false ? "bg-danger-soft text-danger" : l.ok ? "bg-success-soft text-success" : "bg-surface text-muted ring-1 ring-line")}>
            <div className="font-medium">{l.label}</div>
            <div className="text-xs">{l.message}</div>
          </li>
        ))}
      </ul>
    </div>
  );
}
