import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import * as schema from "./schema";

const connectionString = process.env.DATABASE_URL ?? "postgres://inventory:inventory@localhost:5440/inventory";

// Reuse the pool across hot reloads in development.
const globalForDb = globalThis as unknown as { __pool?: Pool };
const pool = globalForDb.__pool ?? new Pool({ connectionString, max: 10 });
if (process.env.NODE_ENV !== "production") globalForDb.__pool = pool;

export const db = drizzle(pool, { schema });
export type Db = typeof db;
/** Either the root db or a transaction handle. */
export type DbOrTx = Pick<Db, "select" | "insert" | "update" | "delete" | "query" | "execute">;
