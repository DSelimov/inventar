/** Помощни функции за четене на FormData в server actions. */

export function str(fd: FormData, key: string, fallback = ""): string {
  const v = fd.get(key);
  return typeof v === "string" ? v.trim() : fallback;
}

export function optional(fd: FormData, key: string): string | null {
  const v = str(fd, key);
  return v === "" ? null : v;
}

export function num(fd: FormData, key: string, fallback = 0): number {
  const v = Number(str(fd, key).replace(",", "."));
  return Number.isFinite(v) ? v : fallback;
}

export function int(fd: FormData, key: string, fallback = 0): number {
  return Math.trunc(num(fd, key, fallback));
}

export function optionalInt(fd: FormData, key: string): number | null {
  const v = str(fd, key);
  if (v === "") return null;
  const n = Number(v);
  return Number.isInteger(n) ? n : null;
}

export function bool(fd: FormData, key: string): boolean {
  const v = fd.get(key);
  return v === "on" || v === "true" || v === "1";
}

export function oneOf<T extends readonly string[]>(
  fd: FormData,
  key: string,
  allowed: T,
  fallback: T[number],
): T[number] {
  const v = str(fd, key);
  return (allowed as readonly string[]).includes(v) ? (v as T[number]) : fallback;
}

export function required(value: string, name: string): string {
  if (!value) throw new Error(`Полето „${name}“ е задължително.`);
  return value;
}
