/** Prepara la BD de tests: aplica las migraciones sobre TEST_DATABASE_URL. */
import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import postgres from "postgres";

export default async function setup() {
  try {
    process.loadEnvFile(".env.local");
  } catch {
    // CI: variables del entorno.
  }
  const url = process.env.TEST_DATABASE_URL;
  if (!url) throw new Error("Falta TEST_DATABASE_URL (ver .env.example)");
  if (url === process.env.DATABASE_URL) throw new Error("TEST_DATABASE_URL no puede ser la misma BD de desarrollo");
  const sql = postgres(url, { max: 1, onnotice: () => {} });
  await migrate(drizzle(sql), { migrationsFolder: "./src/server/db/migrations" });
  await sql.end();
}
