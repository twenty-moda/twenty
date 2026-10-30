import { Suspense } from "react";
import { AdminShell } from "@/components/admin/admin-shell";
import { OPEN_STATUSES } from "@/lib/order-status";
import { getDb } from "@/server/db/client";
import { countPendingComplaints } from "@/server/services/complaints";
import { countNewMessages } from "@/server/services/messages";
import { countOrdersByStatus } from "@/server/services/orders";
import { countSunatIssues } from "@/server/services/pos";
import { requireStaff } from "../_lib/auth";
import { logoutAction } from "../login/actions";

// La sesión se lee dentro de <Suspense>: el marco del panel sale al instante y el contenido llega después.
export default function AdminPanelLayout({ children }: { children: React.ReactNode }) {
  return (
    <Suspense fallback={<PanelSkeleton />}>
      <PanelShell>{children}</PanelShell>
    </Suspense>
  );
}

async function PanelShell({ children }: { children: React.ReactNode }) {
  const user = await requireStaff();
  const db = getDb();
  // El vendedor solo ve la tienda: no hacen falta los contadores de pedidos, mensajes y reclamos.
  if (user.role !== "admin") {
    const sunat = await countSunatIssues(db);
    return (
      <AdminShell user={{ name: user.name, email: user.email }} role="vendedor" openOrders={0} badges={{ orders: 0, messages: 0, complaints: 0, sunat }} logout={logoutAction}>
        {children}
      </AdminShell>
    );
  }
  const [byStatus, messages, complaints, sunat] = await Promise.all([countOrdersByStatus(db), countNewMessages(db), countPendingComplaints(db), countSunatIssues(db)]);
  const openOrders = OPEN_STATUSES.filter((s) => s !== "enviado").reduce((sum, s) => sum + (byStatus[s] ?? 0), 0);
  return (
    <AdminShell
      user={{ name: user.name, email: user.email }}
      role="admin"
      openOrders={openOrders}
      badges={{ orders: openOrders, messages, complaints, sunat }}
      logout={logoutAction}
    >
      {children}
    </AdminShell>
  );
}

function PanelSkeleton() {
  return (
    <div className="min-h-dvh lg:grid lg:grid-cols-[256px_minmax(0,1fr)]" aria-busy="true">
      <div className="hidden border-r border-line bg-surface lg:block" />
      <div className="h-14 border-b border-line lg:hidden" />
    </div>
  );
}
