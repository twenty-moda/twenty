/**
 * Pedidos de demostración (solo desarrollo) para mostrar el admin con datos: clientes ficticios,
 * emails @example.com. Pasan por el mismo flujo que un pedido real (placeOrder + cambios de estado).
 * Uso: pnpm db:seed:demo
 */
import { and, asc, eq, gte } from "drizzle-orm";
import { checkoutSchema } from "@/lib/checkout-schema";
import type { OrderStatus } from "@/lib/order-status";
import { closeDb, getDb } from "../client";
import { products, productVariants } from "../schema";
import { changeOrderStatus, placeOrder } from "../../services/orders";

try {
  process.loadEnvFile(".env.local");
} catch {
  // Sin .env.local.
}

const CUSTOMERS = [
  ["Ana Prueba", "ana.prueba"],
  ["Luis Demo", "luis.demo"],
  ["Carla Ejemplo", "carla.ejemplo"],
  ["Diego Test", "diego.test"],
  ["María Demo", "maria.demo"],
  ["Jorge Prueba", "jorge.prueba"],
];

// [cliente, entrega, estados por los que pasa]
const PLAN: [number, "delivery-lima" | "shalom" | "recojo-en-tienda", OrderStatus[]][] = [
  [0, "delivery-lima", []],
  [1, "shalom", ["por_verificar"]],
  [2, "delivery-lima", ["pagado"]],
  [3, "recojo-en-tienda", ["pagado", "en_preparacion"]],
  [4, "delivery-lima", ["pagado", "enviado"]],
  [5, "shalom", ["pagado", "enviado", "entregado"]],
  [0, "delivery-lima", ["pagado", "enviado", "entregado"]],
  [2, "recojo-en-tienda", ["anulado"]],
];

async function main() {
  const url = new URL(process.env.DATABASE_URL ?? "postgres://x@localhost");
  if (!["localhost", "127.0.0.1"].includes(url.hostname)) throw new Error("Los pedidos de demostración son solo para la BD local.");
  const db = getDb();
  const variants = await db
    .select({ id: productVariants.id })
    .from(productVariants)
    .innerJoin(products, eq(products.id, productVariants.productId))
    .where(and(eq(products.status, "active"), eq(productVariants.isActive, true), gte(productVariants.stock, 2)))
    .orderBy(asc(productVariants.sku))
    .limit(40);
  if (variants.length < 10) throw new Error("Faltan productos con stock: corre primero pnpm db:seed.");

  for (const [i, [customer, method, statuses]] of PLAN.entries()) {
    const [name, email] = CUSTOMERS[customer];
    const pick = (k: number) => variants[(i * 5 + k * 7) % variants.length].id;
    const result = await placeOrder(db, checkoutSchema.parse({
      name,
      email: `${email}@example.com`,
      phone: `9990000${String(customer + 10).padStart(2, "0")}`,
      documentType: "dni",
      documentNumber: `0000000${customer}`,
      invoiceType: "boleta",
      shippingMethod: method,
      ubigeo: method === "delivery-lima" ? "140115" : method === "shalom" ? "040101" : undefined,
      address: method === "delivery-lima" ? `Calle de prueba ${100 + i}` : undefined,
      agencyName: method === "shalom" ? "Agencia Arequipa Centro" : undefined,
      paymentMethod: i % 2 ? "whatsapp" : "yape_plin",
      items: [
        { variantId: pick(0), quantity: 1 },
        ...(i % 3 === 0 ? [{ variantId: pick(1), quantity: 1 }] : []),
      ],
    }));
    if (!result.ok) {
      console.warn(`Pedido ${i + 1} no se creó:`, result);
      continue;
    }
    for (const to of statuses) await changeOrderStatus(db, { orderId: result.orderId, to, note: "Demo", userId: null });
    console.log(`#${result.number} ${name} · ${method} · ${statuses.at(-1) ?? "pendiente"}`);
  }
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(closeDb);
