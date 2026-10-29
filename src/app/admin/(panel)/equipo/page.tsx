import type { Metadata } from "next";
import { AdminPage, Badge, Card, formatDateTime } from "@/components/admin/ui";
import { getDb } from "@/server/db/client";
import { listTeam } from "@/server/services/accounts";
import { emailConfigured } from "@/server/services/email";
import { requireAdmin } from "../../_lib/auth";
import { AddAdminForm, RemoveAdminButton } from "./team-forms";

export const instant = false;
export const metadata: Metadata = { title: "Equipo" };

export default async function TeamPage() {
  const me = await requireAdmin();
  const team = await listTeam(getDb());
  const adminCount = team.filter((a) => a.role === "admin").length;
  return (
    <AdminPage
      title="Equipo"
      description="Quiénes pueden entrar al panel. Los admin ven todo y reciben por email los avisos de pedidos nuevos; los vendedores, solo el punto de venta y la caja."
    >
      <div className="space-y-4">
        <Card title="Dar acceso al panel">
          <p className="mb-4 text-sm text-muted">
            La persona entra en /admin/login con su cuenta de Google o, si no usa Google, con «Crear contraseña» usando este mismo correo. Si ya compró en
            la tienda con ese correo, es la misma cuenta.
          </p>
          <AddAdminForm emailEnabled={emailConfigured()} />
        </Card>

        <Card title={`Con acceso (${team.length})`}>
          <ul className="divide-y divide-line">
            {team.map((a) => (
              <li key={a.id} className="flex flex-wrap items-center gap-3 py-3 first:pt-0 last:pb-0">
                <span className="grid size-10 shrink-0 place-items-center rounded-full bg-raised font-bold uppercase" aria-hidden>
                  {a.name.trim().charAt(0) || a.email.charAt(0)}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="flex flex-wrap items-center gap-2 font-medium">
                    {a.name}
                    <Badge tone={a.role === "admin" ? "info" : "neutral"}>{a.role === "admin" ? "Admin" : "Vendedor"}</Badge>
                    {a.id === me.id ? <Badge>Tú</Badge> : null}
                  </span>
                  <span className="block truncate text-sm text-muted">{a.email}</span>
                  <span className="block text-xs text-subtle">{a.lastLoginAt ? `Último ingreso: ${formatDateTime(a.lastLoginAt)}` : "Aún no entra"}</span>
                </span>
                {a.id !== me.id && (a.role !== "admin" || adminCount > 1) ? <RemoveAdminButton id={a.id} name={a.name} /> : null}
              </li>
            ))}
          </ul>
        </Card>
      </div>
    </AdminPage>
  );
}
