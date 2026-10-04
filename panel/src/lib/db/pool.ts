import pg from "pg";

let pool: pg.Pool | undefined;

/** Pool for the restricted app role (DATABASE_URL). Never use the owner role here. */
export function getPool(): pg.Pool {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is not set");
  pool ??= new pg.Pool({ connectionString: url, max: 10 });
  return pool;
}
