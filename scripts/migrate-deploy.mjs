/**
 * Migraciones al desplegar: Vercel las corre en el build (`buildCommand` de vercel.json), antes de que la versión
 * nueva atienda. Si fallan, ese deploy no sale y sigue la versión anterior. Cada entorno trae su DATABASE_URL:
 * producción migra la BD de producción y los preview, la rama preview de Neon.
 *
 * Las migraciones tienen que ser solo de agregar (tablas, columnas con default, valores de enum): mientras termina el
 * build, la versión anterior sigue atendiendo con la BD ya migrada.
 */
import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import postgres from "postgres";

const pooled = process.env.DATABASE_URL;
if (!pooled) {
  console.error("[migraciones] Falta DATABASE_URL: no se puede migrar y el deploy no sale.");
  process.exit(1);
}
// DDL y el candado van por la conexión directa de Neon, no por el pooler (PgBouncer en modo transacción).
const sql = postgres(pooled.replace("-pooler.", "."), { max: 1, onnotice: () => {}, connect_timeout: 30 });
/** Dos deploys seguidos no migran a la vez: el segundo espera al primero. */
const LOCK = 2026103001;

const applied = async () => {
  const [{ exists }] = await sql`select to_regclass('drizzle.__drizzle_migrations') is not null as exists`;
  if (!exists) return 0;
  const [{ n }] = await sql`select count(*)::int as n from drizzle.__drizzle_migrations`;
  return n;
};

try {
  await sql`select pg_advisory_lock(${LOCK})`;
  const before = await applied();
  // Drizzle aplica todas las pendientes en una sola transacción: si una falla, no queda ninguna a medias.
  await migrate(drizzle(sql), { migrationsFolder: "./src/server/db/migrations" });
  const after = await applied();
  console.log(`[migraciones] ${process.env.VERCEL_ENV ?? "local"}: ${after - before} nuevas, ${after} en total.`);
} catch (error) {
  // Solo el mensaje: nunca la URL de la BD.
  console.error("[migraciones] Fallaron, el deploy no sale:", error instanceof Error ? error.message : error);
  process.exitCode = 1;
} finally {
  await sql.end({ timeout: 5 });
}
