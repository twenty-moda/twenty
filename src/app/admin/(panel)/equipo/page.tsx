import type { Metadata } from "next";
import { AdminPage, Badge, Card, formatDateTime } from "@/components/admin/ui";
import { isPanelRole, PANEL_ROLE_LABEL } from "@/lib/panel-access";
import { getDb } from "@/server/db/client";
import { listTeam } from "@/server/services/accounts";
import { emailConfigured } from "@/server/services/email";
import { requireAdmin } from "../../_lib/auth";
import { AddMemberForm, MemberActions } from "./team-forms";

export const instant = false;
export const metadata: Metadata = { title: "Equipo" };

export default async function TeamPage() {
  const me = await requireAdmin();
  const team = (await listTeam(getDb())).flatMap((a) => (isPanelRole(a.role) ? [{ ...a, role: a.role }] : []));
  const adminCount = team.filter((a) => a.role === "admin").length;
  return (
    <AdminPage
      title="Equipo"
      description="Quiénes entran al panel y con qué perfil. Venta presencial: punto de venta, caja, gastos y comprobantes. Venta virtual: lo mismo más los pedidos de la web. Admin: todo."
    >
      <div className="space-y-4">
        <Card title="Dar acceso al panel">
          <AddMemberForm emailEnabled={emailConfigured()} />
        </Card>

        <Card title={`Con acceso (${team.length})`}>
          <ul className="divide-y divide-line">
            {team.map((a) => {
              const lastAdmin = a.role === "admin" && adminCount <= 1;
              return (
                <li key={a.id} className="flex flex-wrap items-center gap-3 py-3 first:pt-0 last:pb-0">
                  <span className="grid size-10 shrink-0 place-items-center rounded-full bg-raised font-bold uppercase" aria-hidden>
                    {a.name.trim().charAt(0) || (a.email ?? a.username ?? "?").charAt(0)}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="flex flex-wrap items-center gap-2 font-medium">
                      {a.name}
                      <Badge tone={a.role === "admin" ? "info" : a.role === "vendedor_virtual" ? "success" : "neutral"}>{PANEL_ROLE_LABEL[a.role]}</Badge>
                      {a.id === me.id ? <Badge>Tú</Badge> : null}
                    </span>
                    <span className="block truncate text-sm text-muted">{a.email ?? <>Usuario: <span className="font-mono text-white">{a.username}</span></>}</span>
                    <span className="block text-xs text-subtle">{a.lastLoginAt ? `Último ingreso: ${formatDateTime(a.lastLoginAt)}` : "Aún no entra"}</span>
                  </span>
                  {a.id === me.id ? null : (
                    <MemberActions id={a.id} name={a.name} role={a.role} hasUsername={!!a.username} canChange={!lastAdmin} canRemove={!lastAdmin} />
                  )}
                </li>
              );
            })}
          </ul>
        </Card>
      </div>
    </AdminPage>
  );
}
