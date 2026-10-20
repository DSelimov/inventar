import { format, parseISO } from "date-fns";
import { bg } from "date-fns/locale";

export const LOCALE = bg;

export function cn(...classes: Array<string | false | null | undefined>) {
  return classes.filter(Boolean).join(" ");
}

export function formatMoney(value: number, currency = "EUR") {
  try {
    return new Intl.NumberFormat("bg-BG", {
      style: "currency",
      currency,
      maximumFractionDigits: 2,
    }).format(value);
  } catch {
    return `${value.toFixed(2)} ${currency}`;
  }
}

export function formatNumber(value: number) {
  return new Intl.NumberFormat("bg-BG").format(value);
}

/** Форматира Date, ISO дата (ГГГГ-ММ-ДД) или timestamp за показване. */
export function formatDate(value: Date | string | null | undefined, pattern = "d MMM yyyy") {
  if (!value) return "—";
  const d = value instanceof Date ? value : /^\d{4}-\d{2}-\d{2}$/.test(value) ? parseISO(value) : new Date(value);
  if (Number.isNaN(d.getTime())) return String(value);
  return format(d, pattern, { locale: bg });
}

export function formatDateTime(value: Date | string | null | undefined) {
  return formatDate(value, "d MMM yyyy, HH:mm");
}

export function todayIso() {
  return format(new Date(), "yyyy-MM-dd");
}

export function isLowStock(item: { quantity: number; minQuantity: number }) {
  return item.minQuantity > 0 && item.quantity <= item.minQuantity;
}

const CYR: Record<string, string> = {
  а: "a", б: "b", в: "v", г: "g", д: "d", е: "e", ж: "zh", з: "z", и: "i", й: "y", к: "k", л: "l", м: "m",
  н: "n", о: "o", п: "p", р: "r", с: "s", т: "t", у: "u", ф: "f", х: "h", ц: "ts", ч: "ch", ш: "sh",
  щ: "sht", ъ: "a", ь: "y", ю: "yu", я: "ya",
};

/** Транслитерира кирилица към латиница (за кодове на артикули). */
export function transliterate(text: string) {
  return text
    .toLowerCase()
    .split("")
    .map((ch) => CYR[ch] ?? ch)
    .join("");
}

export function slugSku(name: string) {
  const base = transliterate(name)
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 12);
  const suffix = Math.random().toString(36).slice(2, 6).toUpperCase();
  return `${base || "ART"}-${suffix}`;
}

export const STATUS_LABELS: Record<string, string> = {
  pending: "Очаква се",
  in_transit: "В движение",
  delivered: "Доставена",
  cancelled: "Отказана",
  inbound: "Входяща",
  outbound: "Изходяща",
  active: "Активен",
  archived: "Архивиран",
  in: "Приход",
  out: "Разход",
  adjust: "Корекция",
  transfer_in: "Трансфер (вход)",
  transfer_out: "Трансфер (изход)",
  none: "Без проследяване",
  lot: "Партиди",
  serial: "Серийни номера",
  supplier: "Доставчик",
  customer: "Клиент",
  both: "Доставчик и клиент",
  purchase: "Поръчка за доставка",
  sales: "Клиентска поръчка",
  draft: "Чернова",
  confirmed: "Потвърдена",
  partial: "Частично изпълнена",
  completed: "Изпълнена",
  event: "Събитие",
  reminder: "Напомняне",
  deadline: "Краен срок",
  text: "Текст",
  number: "Число",
  date: "Дата",
  select: "Избор",
  boolean: "Да / Не",
};

export function label(value: string) {
  return STATUS_LABELS[value] ?? value;
}

/** Склонение: 1 артикул, 2 артикула. */
export function plural(n: number, one: string, many: string) {
  return n === 1 ? one : many;
}

export function daysBetween(a: Date, b: Date) {
  return Math.floor((b.getTime() - a.getTime()) / 86_400_000);
}
