/**
 * Crea (o actualiza) un usuario del panel.
 * Uso: pnpm admin:create --email tu@correo.com --name "Tu nombre" [--password "..."]
 * Si no se pasa --password se genera una y se muestra una sola vez.
 */
import { randomBytes } from "node:crypto";
import { parseArgs } from "node:util";
import { closeDb, getDb } from "../client";
import { upsertUser } from "../../services/auth";

try {
  process.loadEnvFile(".env.local");
} catch {
  // Sin .env.local: variables del entorno.
}

const { values } = parseArgs({
  options: { email: { type: "string" }, name: { type: "string" }, password: { type: "string" } },
});

async function main() {
  if (!values.email || !values.name) {
    console.error('Uso: pnpm admin:create --email persona@twentymoda.com --name "Nombre" [--password "..."]');
    process.exitCode = 1;
    return;
  }
  if (values.password && values.password.length < 10) {
    console.error("La contraseña debe tener al menos 10 caracteres.");
    process.exitCode = 1;
    return;
  }
  const password = values.password ?? randomBytes(9).toString("base64url");
  const user = await upsertUser(getDb(), { name: values.name, email: values.email, password, role: "admin" });
  console.log(`✅ Admin listo: ${user.email}`);
  if (!values.password) console.log(`   Contraseña generada (guárdala, no se vuelve a mostrar): ${password}`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(closeDb);
