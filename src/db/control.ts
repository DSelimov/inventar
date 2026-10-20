import { drizzle } from "drizzle-orm/mysql2";
import mysql from "mysql2/promise";
import * as schema from "./control-schema";

const url = process.env.CONTROL_DATABASE_URL ?? "mysql://root:root@localhost:3307/inventory_control";

const g = globalThis as unknown as { __controlPool?: mysql.Pool };
const pool = g.__controlPool ?? mysql.createPool({ uri: url, connectionLimit: 10, timezone: "Z", charset: "utf8mb4_0900_ai_ci" });
if (process.env.NODE_ENV !== "production") g.__controlPool = pool;

/** Контролна база: организации, потребители, сесии. */
export const controlDb = drizzle(pool, { schema, mode: "default" });
export type ControlDb = typeof controlDb;
