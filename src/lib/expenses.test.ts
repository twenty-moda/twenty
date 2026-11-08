import { describe, expect, it } from "vitest";
import { expenseCategoryLabel, expenseMonth, monthLabel, shiftMonth } from "./expenses";

describe("gastos", () => {
  it("el mes de la URL o el de hoy en Lima, con su último día", () => {
    expect(expenseMonth("2026-02")).toEqual({ month: "2026-02", from: "2026-02-01", to: "2026-02-28" });
    expect(expenseMonth("2028-02").to).toBe("2028-02-29");
    // 1 de diciembre a las 3:00 UTC todavía es 30 de noviembre en Lima.
    expect(expenseMonth("nada", new Date("2026-12-01T03:00:00Z")).month).toBe("2026-11");
    expect(expenseMonth("2026-13", new Date("2026-11-08T12:00:00Z")).month).toBe("2026-11");
  });

  it("mueve el mes y lo nombra", () => {
    expect(shiftMonth("2026-01", -1)).toBe("2025-12");
    expect(shiftMonth("2026-12", 1)).toBe("2027-01");
    expect(monthLabel("2026-11")).toBe("noviembre de 2026");
    expect(expenseCategoryLabel("adelanto")).toBe("Adelanto de sueldo");
    expect(expenseCategoryLabel("otro-viejo")).toBe("otro-viejo");
  });
});
