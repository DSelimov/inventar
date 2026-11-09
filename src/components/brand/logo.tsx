import { cn } from "@/lib/utils";

/**
 * Знакът на Складио: буквата „С“, подредена от седем кутии (едната жълта — току-що взета стока).
 * Решетка 64×64: плочки 16 px с 4 px разстояние, така че при 16 px всяка кутия е точно 4×4 пиксела.
 * Същата геометрия е в public/brand/*.svg и src/app/icon.svg (от тях са генерирани favicon.ico, apple-icon.png
 * и public/icons/*.png) — пазете ги в синхрон.
 */
const TILES = [
  { x: 4, y: 4, tone: "dark" },
  { x: 24, y: 4, tone: "main" },
  { x: 44, y: 4, tone: "amber" },
  { x: 4, y: 24, tone: "main" },
  { x: 4, y: 44, tone: "main" },
  { x: 24, y: 44, tone: "mid" },
  { x: 44, y: 44, tone: "light" },
] as const;

type Tone = (typeof TILES)[number]["tone"];

const PALETTES: Record<"color" | "white", Record<Tone, string>> = {
  color: { dark: "#1f4e7a", main: "#2f6fab", mid: "#4a8bc9", light: "#6fa8dc", amber: "#f5a623" },
  white: { dark: "rgba(255,255,255,.78)", main: "#ffffff", mid: "rgba(255,255,255,.85)", light: "rgba(255,255,255,.62)", amber: "#f5a623" },
};

export function LogoMark({ tone = "color", className }: { tone?: "color" | "white"; className?: string }) {
  const p = PALETTES[tone];
  return (
    <svg viewBox="0 0 64 64" aria-hidden="true" focusable="false" className={cn("shrink-0", className)}>
      {TILES.map((t) => (
        <rect key={`${t.x}-${t.y}`} x={t.x} y={t.y} width="16" height="16" rx="3.5" fill={p[t.tone]} />
      ))}
    </svg>
  );
}

/** Знак + името „Складио“ (шрифт Manrope). `suffix` добавя пояснение: „Помощ“, „API“, „Платформа“. */
export function Logo({
  tone = "color",
  size = "md",
  suffix,
  className,
}: {
  tone?: "color" | "white";
  size?: "sm" | "md";
  suffix?: React.ReactNode;
  className?: string;
}) {
  return (
    <span className={cn("inline-flex items-center", size === "sm" ? "gap-2" : "gap-2.5", className)}>
      <LogoMark tone={tone} className={size === "sm" ? "h-6 w-6" : "h-8 w-8"} />
      <span className={cn("font-brand font-extrabold tracking-tight", size === "sm" ? "text-base" : "text-xl")}>Складио</span>
      {suffix && <span className={cn("font-normal", tone === "white" ? "text-white/80" : "text-muted", size === "sm" ? "text-sm" : "text-base")}>{suffix}</span>}
    </span>
  );
}
