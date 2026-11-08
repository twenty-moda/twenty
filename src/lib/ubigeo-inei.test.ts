import { describe, expect, it } from "vitest";
import { findInei, ineiDistricts, ineiLabel } from "./ubigeo-inei";

describe("ubigeos del INEI", () => {
  it("tiene los distritos con su provincia y departamento", () => {
    expect(ineiDistricts().length).toBeGreaterThan(1800);
    expect(findInei("150115")).toEqual({ ubigeo: "150115", district: "LA VICTORIA", province: "LIMA", department: "LIMA" });
    expect(ineiLabel(findInei("040101")!)).toBe("AREQUIPA · AREQUIPA · AREQUIPA");
    expect(findInei("999999")).toBeNull();
  });
});
