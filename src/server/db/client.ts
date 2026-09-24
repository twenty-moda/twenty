import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";

// Un solo pool por proceso. En dev el hot reload recrea módulos, así que se guarda en globalThis.
const globalForDb = globalThis as unknown as { twentySql?: postgres.Sql };

function createSql() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("Falta DATABASE_URL (ver .env.example)");
  return postgres(url, {
    max: Number(process.env.DATABASE_POOL_MAX) || 5,
    // El pooler de Neon/Supabase (PgBouncer en modo transacción) no soporta prepared statements.
    prepare: false,
    idle_timeout: 20,
  });
}

function getSql() {
  globalForDb.twentySql ??= createSql();
  return globalForDb.twentySql;
}

export type Db = ReturnType<typeof createDb>;

function createDb() {
  return drizzle(getSql(), { schema, casing: "snake_case" });
}

let dbInstance: Db | undefined;

/** Cliente perezoso: importar este módulo no abre conexiones ni exige DATABASE_URL. */
export function getDb(): Db {
  dbInstance ??= createDb();
  return dbInstance;
}

export async function closeDb() {
  await globalForDb.twentySql?.end();
  globalForDb.twentySql = undefined;
  dbInstance = undefined;
}
