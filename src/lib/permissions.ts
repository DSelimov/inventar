import type { Role } from "@/db/schema";

/** Permission levels, lowest to highest. A role grants its level and everything below. */
export const LEVELS = ["read", "write", "delete", "manage", "owner"] as const;
export type Level = (typeof LEVELS)[number];

const ROLE_LEVEL: Record<Role, number> = {
  viewer: 0, // read
  staff: 1, // write
  manager: 2, // delete
  admin: 3, // manage
  owner: 4, // owner
};

export function can(role: Role, level: Level): boolean {
  return ROLE_LEVEL[role] >= LEVELS.indexOf(level);
}

export const ROLE_LABELS: Record<Role, string> = {
  owner: "Собственик",
  admin: "Администратор",
  manager: "Мениджър",
  staff: "Служител",
  viewer: "Само четене",
};

export const ROLE_DESCRIPTIONS: Record<Role, string> = {
  owner: "Пълен достъп, включително изтриване на организацията.",
  admin: "Настройки, потребители, локации, API ключове, импорт.",
  manager: "Всичко на служител плюс изтриване на записи.",
  staff: "Създава и променя артикули, движения, пратки, поръчки.",
  viewer: "Вижда всичко, не може да променя нищо.",
};
