import { describe, expect, it } from "vitest";
import { hashPassword, normalizeUsername, passwordProblem, USERNAME_PATTERN, verifyPassword } from "./passwords";

describe("contraseñas del equipo", () => {
  it("guarda un hash con sal propia y lo verifica", async () => {
    const a = await hashPassword("caja-gamarra-2026");
    const b = await hashPassword("caja-gamarra-2026");
    expect(a).toMatch(/^scrypt\$16384\$8\$1\$/);
    expect(a).not.toBe(b);
    expect(await verifyPassword("caja-gamarra-2026", a)).toBe(true);
    expect(await verifyPassword("caja-gamarra-2027", a)).toBe(false);
  });

  it("sin hash nunca entra", async () => {
    expect(await verifyPassword("lo-que-sea", null)).toBe(false);
    expect(await verifyPassword("lo-que-sea", "$2b$10$algo-de-bcrypt")).toBe(false);
  });

  it("revisa el usuario y la contraseña nueva", () => {
    expect(USERNAME_PATTERN.test(normalizeUsername("  Vendedor1 "))).toBe(true);
    expect(USERNAME_PATTERN.test("ana@gmail.com")).toBe(false);
    expect(USERNAME_PATTERN.test("ab")).toBe(false);
    expect(passwordProblem("corta")).toMatch(/al menos 8/);
    expect(passwordProblem("vendedor1-tienda", "vendedor1")).toMatch(/no puede contener el usuario/);
    expect(passwordProblem("12345678")).toMatch(/fácil/);
    expect(passwordProblem("gamarra-1288")).toBeNull();
  });
});
