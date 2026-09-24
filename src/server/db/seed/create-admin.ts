/**
 * Da acceso al panel a un email (crea la cuenta si no existe; si ya era cliente, pasa a admin).
 * Uso: pnpm admin:create --email persona@twentymoda.com --name "Nombre"
 *
 * No hay contraseñas aquí: la persona entra en /admin/login con Google o con correo y contraseña (Firebase). Si ese
 * correo aún no tiene contraseña, la crea ahí mismo con «Crear contraseña» (le llega un correo para confirmarlo).
 */
import { parseArgs } from "node:util";
import { closeDb, getDb } from "../client";
import { grantAdmin } from "../../services/accounts";

try {
  process.loadEnvFile(".env.local");
} catch {
  // Sin .env.local: variables del entorno.
}

const { values } = parseArgs({ options: { email: { type: "string" }, name: { type: "string" } } });

async function main() {
  if (!values.email?.includes("@") || !values.name) {
    console.error('Uso: pnpm admin:create --email persona@twentymoda.com --name "Nombre"');
    process.exitCode = 1;
    return;
  }
  const user = await grantAdmin(getDb(), { email: values.email, name: values.name });
  console.log(`✅ ${user.email} ya tiene acceso al panel.`);
  console.log("   Entra en /admin/login con Google o con «Crear contraseña» usando ese correo.");
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(closeDb);
