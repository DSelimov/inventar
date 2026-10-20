/** Странициране на списъци: 50 реда на страница, номерът на страницата е в ?page=. */
export const PAGE_SIZE = 50;

export type Page<T> = { rows: T[]; total: number; page: number; pageSize: number };

export type SearchParams = Record<string, string | string[] | undefined>;

export const param = (sp: SearchParams, key: string) => {
  const v = sp[key];
  return (Array.isArray(v) ? v[0] : v) ?? "";
};

export function pageParam(sp: SearchParams) {
  const n = Number(param(sp, "page"));
  return Number.isInteger(n) && n > 0 ? n : 1;
}

export const offsetOf = (page: number, pageSize = PAGE_SIZE) => (page - 1) * pageSize;
