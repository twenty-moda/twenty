import type { Metadata } from "next";
import { AdminPage } from "@/components/admin/ui";
import { todayInLima } from "@/lib/reports";
import { getDb } from "@/server/db/client";
import { listWarehouses } from "@/server/services/inventory";
import { listOpenSessions } from "@/server/services/pos";
import { requireStaff } from "../../../_lib/auth";
import { ExpenseForm } from "./expense-form";

export const instant = false;
export const metadata: Metadata = { title: "Nuevo gasto" };

export default async function NewExpensePage() {
  const user = await requireStaff();
  const db = getDb();
  const [warehouses, open] = await Promise.all([listWarehouses(db), listOpenSessions(db)]);
  return (
    <AdminPage title="Nuevo gasto" back={{ href: "/admin/gastos", label: "Gastos" }} description="Si se paga con el efectivo de tu caja, también se puede anotar desde Caja.">
      <ExpenseForm
        warehouses={warehouses.filter((w) => w.isActive).map((w) => ({ id: w.id, name: w.name }))}
        openCashWarehouses={open.filter((s) => s.openedBy === user.id).map((s) => s.warehouseId)}
        today={todayInLima()}
      />
    </AdminPage>
  );
}
