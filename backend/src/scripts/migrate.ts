import { readdir, readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { pool, withTransaction } from "../db.js";

const here = path.dirname(fileURLToPath(import.meta.url));
const migrationsDir = path.resolve(here, "../../migrations");

try {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      name TEXT PRIMARY KEY,
      applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
  const files = (await readdir(migrationsDir)).filter((file) => file.endsWith(".sql")).sort();
  for (const name of files) {
    const alreadyApplied = await pool.query("SELECT 1 FROM schema_migrations WHERE name = $1", [name]);
    if (alreadyApplied.rowCount) continue;
    const sql = await readFile(path.join(migrationsDir, name), "utf8");
    await withTransaction(async (client) => {
      await client.query(sql);
      await client.query("INSERT INTO schema_migrations (name) VALUES ($1)", [name]);
    });
    console.info(`Applied ${name}`);
  }
  console.info("Database migrations are up to date.");
} catch (error) {
  console.error("Database migration failed", error);
  process.exitCode = 1;
} finally {
  await pool.end();
}
