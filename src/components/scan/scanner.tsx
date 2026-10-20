"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Camera, CameraOff } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/fields";

export function Scanner({ initialCode }: { initialCode?: string }) {
  const router = useRouter();
  const [active, setActive] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [code, setCode] = useState(initialCode ?? "");
  const scannerRef = useRef<{ stop: () => Promise<void>; clear: () => void } | null>(null);
  const lastRef = useRef<{ code: string; at: number }>({ code: "", at: 0 });

  const go = (value: string) => {
    const v = value.trim();
    if (!v) return;
    router.push(`/scan?code=${encodeURIComponent(v)}`);
  };

  const stop = async () => {
    try {
      await scannerRef.current?.stop();
      scannerRef.current?.clear();
    } catch {
      /* already stopped */
    }
    scannerRef.current = null;
    setActive(false);
  };

  const start = async () => {
    setError(null);
    try {
      const { Html5Qrcode } = await import("html5-qrcode");
      const scanner = new Html5Qrcode("scanner-view", { verbose: false });
      scannerRef.current = scanner;
      await scanner.start(
        { facingMode: "environment" },
        { fps: 10, qrbox: { width: 260, height: 160 } },
        (text) => {
          const now = Date.now();
          if (text === lastRef.current.code && now - lastRef.current.at < 3000) return;
          lastRef.current = { code: text, at: now };
          setCode(text);
          void stop().then(() => go(text));
        },
        () => {},
      );
      setActive(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Камерата не е достъпна. Използвайте полето за ръчно въвеждане или USB скенер.");
      setActive(false);
    }
  };

  useEffect(() => () => void stop(), []);

  return (
    <div className="space-y-4">
      <form
        onSubmit={(e) => {
          e.preventDefault();
          go(code);
        }}
        className="flex gap-2"
      >
        <Input value={code} onChange={(e) => setCode(e.target.value)} placeholder="Сканирайте или въведете баркод / код…" className="font-mono" autoFocus autoComplete="off" />
        <Button type="submit">Търси</Button>
      </form>
      <p className="text-xs text-muted">USB/Bluetooth скенерите пишат в полето като клавиатура и натискат Enter. За камера на телефон използвайте бутона.</p>
      <div id="scanner-view" className={active ? "overflow-hidden rounded-2xl border border-line" : "hidden"} />
      {error && <p className="rounded-lg bg-warning-soft px-3 py-2 text-xs text-warning">{error}</p>}
      {active ? (
        <Button variant="secondary" onClick={() => void stop()}>
          <CameraOff className="h-4 w-4" /> Спри камерата
        </Button>
      ) : (
        <Button variant="secondary" onClick={() => void start()}>
          <Camera className="h-4 w-4" /> Сканирай с камера
        </Button>
      )}
    </div>
  );
}
