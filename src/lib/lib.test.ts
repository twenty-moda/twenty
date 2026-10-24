import { describe, expect, it } from "vitest";
import { countryLabel, deviceLabel, groupRows, hidePrivateIds, routeLabel, sourceLabel } from "./analytics";
import { IMAGE_SPECS, imageWarnings } from "./image-specs";
import { discountPercent, formatPrice } from "./money";
import { compareSizes } from "./sizes";
import { slugify } from "./slug";

describe("hidePrivateIds", () => {
  it("cambia el id del pedido y de la constancia por [id] y deja las demás URLs igual", () => {
    expect(hidePrivateIds("https://twentymoda.com/pedido/9f3c2b1a-77de-4c1e?pagar=1#pago")).toBe("https://twentymoda.com/pedido/[id]?pagar=1");
    expect(hidePrivateIds("https://twentymoda.com/libro-de-reclamaciones/constancia/abc123")).toBe(
      "https://twentymoda.com/libro-de-reclamaciones/constancia/[id]",
    );
    expect(hidePrivateIds("https://twentymoda.com/product/baggy-jean?color=negro&talla=30")).toBe(
      "https://twentymoda.com/product/baggy-jean?color=negro&talla=30",
    );
    expect(hidePrivateIds("https://twentymoda.com/libro-de-reclamaciones")).toBe("https://twentymoda.com/libro-de-reclamaciones");
  });
});

describe("nombres de /admin/visitas", () => {
  it("junta los sitios de cada red y deja «Others» al final", () => {
    const rows = [
      { key: "l.instagram.com", visitors: 5, pageviews: 9 },
      { key: "", visitors: 7, pageviews: 8 },
      { key: "Others", visitors: 20, pageviews: 30 },
      { key: "www.instagram.com", visitors: 4, pageviews: 4 },
      { key: "www.google.com.pe", visitors: 1, pageviews: 1 },
    ];
    expect(groupRows(rows, sourceLabel, "visitors")).toEqual([
      { key: "Instagram", label: "Instagram", value: 9, others: false },
      { key: "Directo o sin enlace", label: "Directo o sin enlace", value: 7, others: false },
      { key: "Google", label: "Google", value: 1, others: false },
      { key: "Otros sitios", label: "Otros sitios", value: 20, others: true },
    ]);
    expect(sourceLabel("lm.facebook.com")).toBe("Facebook");
    expect(sourceLabel("blog.ejemplo.pe")).toBe("blog.ejemplo.pe");
  });

  it("páginas, dispositivos y países en español", () => {
    expect(routeLabel("/product/[slug]")).toBe("Fichas de prendas");
    expect(routeLabel("/una-ruta-nueva")).toBe("/una-ruta-nueva");
    expect(deviceLabel("mobile")).toBe("Teléfono");
    expect(countryLabel("PE")).toBe("Perú");
  });
});

describe("formatPrice", () => {
  it("muestra soles enteros sin decimales y con decimales cuando los hay", () => {
    expect(formatPrice(7000)).toBe("S/ 70");
    expect(formatPrice(6990)).toBe("S/ 69.90");
    expect(formatPrice(123456)).toBe("S/ 1,234.56");
    expect(formatPrice(-1500)).toBe("-S/ 15");
  });
});

describe("discountPercent", () => {
  it("calcula el porcentaje solo si el precio anterior es mayor", () => {
    expect(discountPercent(7000, 9900)).toBe(29);
    expect(discountPercent(7000, 7000)).toBeNull();
    expect(discountPercent(7000, null)).toBeNull();
  });
});

describe("compareSizes", () => {
  it("ordena letras de menor a mayor y luego números", () => {
    expect(["32", "L", "28", "XS", "M", "XL", "S", "30"].sort(compareSizes)).toEqual(["XS", "S", "M", "L", "XL", "28", "30", "32"]);
  });
});

describe("slugify", () => {
  it("quita tildes, espacios dobles y símbolos", () => {
    expect(slugify("Baggy Ángel  T-20")).toBe("baggy-angel-t-20");
    expect(slugify("  Súper Baggy / Negro ")).toBe("super-baggy-negro");
  });
});

describe("imageWarnings", () => {
  it("no avisa si la foto tiene la medida y la forma recomendadas (o es más grande)", () => {
    expect(imageWarnings({ width: 1200, height: 1600 }, IMAGE_SPECS.product)).toEqual([]);
    expect(imageWarnings({ width: 3000, height: 4000 }, IMAGE_SPECS.product)).toEqual([]);
  });

  it("avisa si es chica o si se va a recortar", () => {
    expect(imageWarnings({ width: 600, height: 800 }, IMAGE_SPECS.product)).toEqual([
      "Mide 600 × 800 px: puede verse borrosa. Lo ideal es 1200 × 1600 px.",
    ]);
    // El banner del inicio es vertical (foto del hero): una horizontal se recorta a los costados.
    expect(imageWarnings({ width: 2400, height: 1600 }, IMAGE_SPECS.bannerDesktop)).toEqual(["No es vertical 4:5: en la tienda se recortará a los costados."]);
    expect(imageWarnings({ width: 1200, height: 1200 }, IMAGE_SPECS.product)).toEqual(["No es vertical 3:4: en la tienda se recortará a los costados."]);
  });
});
