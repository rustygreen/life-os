import { Pool } from "pg";

let pool: Pool | undefined;

export function getPool(): Pool {
  if (!pool) {
    const connectionString =
      process.env.DATABASE_URL ??
      "postgresql://life_os:life_os@localhost:5432/life_os";

    pool = new Pool({
      connectionString
    });
  }

  return pool;
}
