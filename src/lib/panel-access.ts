/**
 * Quién ve qué en el panel (pedido de TWENTY, 08/11/2026: dos perfiles de vendedor además del admin).
 * - admin: todo.
 * - vendedor (venta presencial): punto de venta, caja, gastos, comprobantes, cotizaciones y guías.
 * - vendedor_virtual (venta virtual): lo mismo + los pedidos de la web (los registra en su punto de venta).
 * Lo usan el menú (cliente) y los `require…` del servidor.
 */
export const PANEL_ROLES = ["admin", "vendedor", "vendedor_virtual"] as const;
export type PanelRole = (typeof PANEL_ROLES)[number];

export const isPanelRole = (role: string | null | undefined): role is PanelRole => PANEL_ROLES.includes(role as PanelRole);

export const PANEL_ROLE_LABEL: Record<PanelRole, string> = {
  admin: "Admin",
  vendedor: "Venta presencial",
  vendedor_virtual: "Venta virtual",
};

export const PANEL_ROLE_HINT: Record<PanelRole, string> = {
  admin: "Todo el panel: pedidos, productos, inventario, reportes, contenido y equipo. Recibe los avisos de pedidos.",
  vendedor: "Punto de venta, su caja, gastos, comprobantes, cotizaciones y guías. No anula ventas.",
  vendedor_virtual: "Lo mismo que venta presencial y además los pedidos de la web, para registrarlos en su punto de venta.",
};

/** "staff" = todo el equipo; "orders" = admin y venta virtual; "admin" = solo el admin. */
export type PanelAccess = "staff" | "orders" | "admin";

export function canAccess(role: PanelRole, access: PanelAccess): boolean {
  if (role === "admin") return true;
  if (access === "staff") return true;
  return access === "orders" && role === "vendedor_virtual";
}

/** Dónde empieza cada perfil al entrar. */
export const panelHome = (role: PanelRole) => (role === "admin" ? "/admin" : "/admin/pos");

/** Cómo se muestra la cuenta: el correo o «usuario …». */
export const accountLogin = (user: { email: string | null; username: string | null }) => user.email ?? (user.username ? `usuario ${user.username}` : "");
