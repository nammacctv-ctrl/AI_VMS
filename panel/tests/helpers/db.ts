import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { randomBytes } from "node:crypto";
import pg from "pg";

/** Set TEST_ADMIN_DATABASE_URL to a superuser URL (e.g. postgres://postgres:postgres@127.0.0.1:5432/postgres). */
export const adminUrl = process.env.TEST_ADMIN_DATABASE_URL;

export interface TestDb {
  ownerUrl: string;
  appPool: pg.Pool;
  ownerPool: pg.Pool;
  drop: () => Promise<void>;
}

const APP_LOGIN = "panel_app_test";
const APP_PASSWORD = "panel_app_test_pw";

export async function createTestDb(): Promise<TestDb> {
  if (!adminUrl) throw new Error("TEST_ADMIN_DATABASE_URL not set");
  const name = `panel_test_${randomBytes(4).toString("hex")}`;
  const admin = new pg.Client({ connectionString: adminUrl });
  await admin.connect();
  await admin.query(`CREATE DATABASE ${name}`);
  await admin.end();

  const withDb = (user?: string, password?: string) => {
    const u = new URL(adminUrl!);
    u.pathname = `/${name}`;
    if (user) {
      u.username = user;
      u.password = password ?? "";
    }
    return u.toString();
  };

  const ownerPool = new pg.Pool({ connectionString: withDb(), max: 4 });
  const dir = path.join(__dirname, "..", "..", "db", "migrations");
  for (const file of (await readdir(dir)).filter((f) => f.endsWith(".sql")).sort()) {
    await ownerPool.query(await readFile(path.join(dir, file), "utf8"));
  }

  // The login role is shared per cluster; create it once and grant membership.
  const root = new pg.Client({ connectionString: adminUrl });
  await root.connect();
  const exists = await root.query("SELECT 1 FROM pg_roles WHERE rolname = $1", [APP_LOGIN]);
  if (exists.rowCount === 0) {
    await root.query(`CREATE ROLE ${APP_LOGIN} LOGIN PASSWORD '${APP_PASSWORD}' NOBYPASSRLS IN ROLE panel_app`);
  }
  await root.end();

  const appPool = new pg.Pool({ connectionString: withDb(APP_LOGIN, APP_PASSWORD), max: 4 });
  return {
    ownerUrl: withDb(),
    appPool,
    ownerPool,
    drop: async () => {
      await appPool.end();
      await ownerPool.end();
      const c = new pg.Client({ connectionString: adminUrl });
      await c.connect();
      await c.query(`DROP DATABASE IF EXISTS ${name} WITH (FORCE)`);
      await c.end();
    },
  };
}
