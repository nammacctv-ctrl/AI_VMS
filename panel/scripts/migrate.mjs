// Applies db/migrations/*.sql in order, once each. Run as the schema OWNER
// (not the restricted app role): MIGRATE_DATABASE_URL=... npm run db:migrate
import { readdir, readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";
import pg from "pg";

const url = process.env.MIGRATE_DATABASE_URL;
if (!url) {
  console.error("MIGRATE_DATABASE_URL is required");
  process.exit(1);
}

const dir = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "db", "migrations");
const client = new pg.Client({ connectionString: url });
await client.connect();
try {
  await client.query(
    "CREATE TABLE IF NOT EXISTS schema_migrations (name text PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT now())",
  );
  const done = new Set((await client.query("SELECT name FROM schema_migrations")).rows.map((r) => r.name));
  for (const file of (await readdir(dir)).filter((f) => f.endsWith(".sql")).sort()) {
    if (done.has(file)) continue;
    await client.query("BEGIN");
    try {
      await client.query(await readFile(path.join(dir, file), "utf8"));
      await client.query("INSERT INTO schema_migrations (name) VALUES ($1)", [file]);
      await client.query("COMMIT");
      console.log("applied", file);
    } catch (err) {
      await client.query("ROLLBACK");
      throw err;
    }
  }
  // Provision the restricted login role used by the running app.
  const appPassword = process.env.APP_DB_PASSWORD;
  if (appPassword) {
    const lit = client.escapeLiteral(appPassword);
    const exists = await client.query("SELECT 1 FROM pg_roles WHERE rolname = 'panel_login'");
    await client.query(
      exists.rowCount
        ? `ALTER ROLE panel_login LOGIN PASSWORD ${lit}`
        : `CREATE ROLE panel_login LOGIN PASSWORD ${lit} NOBYPASSRLS IN ROLE panel_app`,
    );
    console.log("app login role ready");
  }
} finally {
  await client.end();
}
