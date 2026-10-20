import { createClient } from "@libsql/client";
import { drizzle } from "drizzle-orm/libsql";
import * as schema from "./schema";

const url = process.env.DATABASE_URL ?? "file:./data/inventory.db";

const client = createClient({ url, authToken: process.env.DATABASE_AUTH_TOKEN });

// Enforce FK cascades on SQLite (off by default per connection).
void client.execute("PRAGMA foreign_keys = ON");

export const db = drizzle(client, { schema });
export type Db = typeof db;
