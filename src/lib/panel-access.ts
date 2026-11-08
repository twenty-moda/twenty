/**
 * Quién ve qué en el panel (pedido de TWENTY, 08/11/2026: dos perfiles de vendedor además del admin).
 * - admin: todo.
 * - vendedor («Solo tienda»): punto de venta (solo venta en tienda), caja, gastos, comprobantes, cotizaciones y guías.
 * - vendedor_virtual («Tienda y web»): lo mismo, puede marcar una venta como virtual (WhatsApp, redes) y atiende los
 *   pedidos de la web. En la BD los valores siguen siendo los de antes (vendedor, vendedor_virtual).
 * Lo usan el menú (cliente) y los `require…` del servidor.
 */
export const PANEL_ROLES = ["admin", "vendedor", "vendedor_virtual"] as const;
export type PanelRole = (typeof PANEL_ROLES)[number];

export const isPanelRole = (role: string | null | undefined): role is PanelRole => PANEL_ROLES.includes(role as PanelRole);

export const PANEL_ROLE_LABEL: Record<PanelRole, string> = {
  admin: "Admin",
  vendedor: "Solo tienda",
  vendedor_virtual: "Tienda y web",
};

export const PANEL_ROLE_HINT: Record<PanelRole, string> = {
  admin: "Todo el panel: pedidos, productos, inventario, reportes, contenido y equipo. Puede recibir los avisos de pedidos por correo.",
  vendedor: "Venta presencial: punto de venta, su caja, gastos, comprobantes, cotizaciones y guías. No anula ventas.",
  vendedor_virtual: "Venta presencial y virtual: todo lo de «Solo tienda», marca sus ventas por WhatsApp o redes como virtuales y atiende los pedidos de la web.",
};

/** "staff" = todo el equipo; "orders" = admin y «Tienda y web» (pedidos web y venta virtual); "admin" = solo el admin. */
export type PanelAccess = "staff" | "orders" | "admin";

export function canAccess(role: PanelRole, access: PanelAccess): boolean {
  if (role === "admin") return true;
  if (access === "staff") return true;
  return access === "orders" && role === "vendedor_virtual";
}

/** Quién puede marcar una venta del punto de venta como virtual: «Tienda y web» y el admin. */
export const canSellVirtual = (role: PanelRole) => canAccess(role, "orders");

/** Dónde empieza cada perfil al entrar. */
export const panelHome = (role: PanelRole) => (role === "admin" ? "/admin" : "/admin/pos");

/** Cómo se muestra la cuenta: el correo o «usuario …». */
export const accountLogin = (user: { email: string | null; username: string | null }) => user.email ?? (user.username ? `usuario ${user.username}` : "");
