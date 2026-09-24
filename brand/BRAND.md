# Marca TWENTY

## Logos (`brand/logos/`)
- `twenty-logo.webp`: wordmark "TWENTY" (WebP con transparencia, 290 KB; en el servidor se llamaba `logo.png` pero en realidad es WebP). El sitio usa el mismo archivo para header, footer y pantalla de carga.
- `twenty-icon-t20.jpg`: isotipo circular "T-20 / TWENTY", 300×300 px, fondo negro (favicon y og-image; en el servidor se llamaba `icon.png` pero es JPEG).
- **Falta el logo en vector (SVG/AI).** Hay que pedírselo al diseñador de la marca. Los SVG de la plataforma anterior son de Rhino Technology y Mundo Web, **no** de TWENTY: no usarlos.

## Colores
Ver `colors.json` / `tokens.css`. La identidad es monocromática: negro `#000000`, blanco `#ffffff`, gris `#b1b1b1`, gris claro de secciones `#f3f3f3`. Amarillo, azul, rojo y verde solo se usan para estados (warning/info/danger/success).

## Tipografía
**Libre Franklin** (Google Fonts, licencia libre). En Next.js: `next/font/google`.

## Tono / copy (de la BD)
- Título del sitio: "TWENTY"
- Descripción: "Moda urbana joven diseñada para el día a día. Nos enfocamos en ofrecerte prendas de alta calidad, cortes perfectos y la comodidad…"
- Cintillo superior: "¡COMPRA Y RECIBE TU PEDIDO EN 48 HORAS! SOLO PARA LIMA METROPOLITANA, APLICA TyC"
- Hero: "TENDENCIA JUVENIL"
- Ojo: el `<title>` del sitio actual dice "Tecnología para tu día a día | TWENTY" (quedó de la plantilla). Corregirlo.
