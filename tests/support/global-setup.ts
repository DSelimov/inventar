/* Създава празна тестова контролна база преди тестовете и изтрива всички тестови бази след тях. */
import { drizzle } from "drizzle-orm/mysql2";
import { migrate } from "drizzle-orm/mysql2/migrator";
import mysql from "mysql2/promise";
import path from "node:path";

const prefix = process.env.TENANT_DB_PREFIX!;

async function dropTestDatabases(conn: mysql.Connection) {
  const [rows] = await conn.query<mysql.RowDataPacket[]>("SHOW DATABASES LIKE ?", [`${prefix.replace(/_/g, "\\_")}%`]);
  for (const r of rows) await conn.query(`DROP DATABASE \`${Object.values(r)[0]}\``);
}

export async function setup() {
  // Защита: никога не трий бази за разработка/продукция.
  if (!/test/.test(prefix)) throw new Error(`TEST_DB_PREFIX „${prefix}“ трябва да съдържа „test“.`);
  const conn = await mysql.createConnection(process.env.TENANT_DB_ADMIN_URL!);
  try {
    await dropTestDatabases(conn);
    await conn.query(`CREATE DATABASE \`${prefix}control\` CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci`);
  } finally {
    await conn.end();
  }
  const pool = mysql.createPool({ uri: process.env.CONTROL_DATABASE_URL!, connectionLimit: 1 });
  await migrate(drizzle(pool), { migrationsFolder: path.resolve("drizzle/control") });
  await pool.end();

  return async function teardown() {
    if (process.env.KEEP_TEST_DBS) return;
    const c = await mysql.createConnection(process.env.TENANT_DB_ADMIN_URL!);
    try {
      await dropTestDatabases(c);
    } finally {
      await c.end();
    }
  };
}
