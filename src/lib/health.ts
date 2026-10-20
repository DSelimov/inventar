/** Състояние за /api/health, общо за процеса. */
type MigrationStatus = { ok: boolean; at: string; failed?: string[]; error?: string };

const g = globalThis as unknown as { __migrationStatus?: MigrationStatus | null; __startedAt?: number };
g.__startedAt ??= Date.now();

export function setMigrationStatus(s: MigrationStatus) {
  g.__migrationStatus = s;
}

export function migrationStatus() {
  return g.__migrationStatus ?? null;
}

export const startedAt = () => g.__startedAt!;
