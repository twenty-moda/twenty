# Limpieza del catálogo (generado por `pnpm db:seed`)

Decisiones tomadas al convertir el catálogo anterior al modelo nuevo. Revisar con TWENTY los puntos marcados.

- Categoría "Blusa": slug "97b040ca-be0e-4e30-98b3-bc3564a942be" reemplazado por "blusa".
- Categoría "CHOMPA": slug "207cb593-4077-4a88-92f1-c748b85facbb" reemplazado por "chompa".
- Categoría "PUFFER": slug "f62e996d-6986-452b-b68c-cfa90d6f9da4" reemplazado por "puffer".
- Categoría "ZIP HOODIE": slug "6b57449a-12e4-48e3-92ae-a2b9af1711e4" reemplazado por "zip-hoodie".
- Categoría "POLO" unificada con "Polos".
- Subcategoría "Sub categoria nueva" descartada (inactiva).
- Subcategoría "BOXI FIT" (boxi-fit-a1d1a934) unificada con "boxi-fit".
- Subcategoría "REGULAR FIT" (regular-fit-759b0894) unificada con "regular-fit".
- Subcategoría "BOXI FIT" (boxi-fit-a77071b5) unificada con "boxi-fit".
- Subcategoría "SASTRE" (sastre-f57d0ea9) unificada con "sastre".
- Subcategoría "REGULAR FIT" (regular-fit-b17e9c99) unificada con "regular-fit".
- 960 filas de item_attribute de items borrados ignoradas.
- Item TMW-0286 (hoodie-moon-regular-fit-beige-m): color y talla tomados del nombre (faltaban atributos).
- SKU repetido TMW-0205 en "pantalon-mom-jean" (plomo-focalizado 28): se guardó como TMW-0205-2. Revisar color/foto.
- SKU repetido TMW-0206 en "pantalon-mom-jean" (plomo-focalizado 30): se guardó como TMW-0206-2. Revisar color/foto.
- SKU repetido TMW-0207 en "pantalon-mom-jean" (plomo-focalizado 32): se guardó como TMW-0207-2. Revisar color/foto.
- SKU repetido TMW-0208 en "pantalon-mom-jean" (plomo-focalizado 34): se guardó como TMW-0208-2. Revisar color/foto.
- Producto "polo-boxy-fit-travis-scott" queda en borrador: no tiene variantes activas.
- Foto faltante: item/TMW-0167.webp (polo-boxy-fit-travis-scott).
- 106 variantes duplicadas (mismo producto, color y talla) unificadas.
- 1 referencias a fotos que no están en assets/images/item.
- URL anterior /product/jacket-oversize-corduroy sin producto equivalente.
- URL anterior /product/jacket-oversize-corduroy-negro-l-negro-l sin producto equivalente.
- URL anterior /product/jacket-oversize-corduroy-verde-l-verde-l sin producto equivalente.
- URL anterior /product/jacket-oversize-corduroy-beige-l-beige-l sin producto equivalente.
- URL anterior /product/jacket-oversize-corduroy-negro-m-negro-m sin producto equivalente.
- URL anterior /product/jacket-oversize-corduroy-plomo-m-plomo-m sin producto equivalente.
- URL anterior /product/jacket-oversize-corduroy-verde-m-verde-m sin producto equivalente.
- URL anterior /product/jort-galaxy sin producto equivalente.
- URL anterior /product/jort-galaxy-maiz-claro-28-maiz-claro-28 sin producto equivalente.
- URL anterior /product/jort-galaxy-maiz-oscuro-28-maiz-oscuro-28 sin producto equivalente.
- URL anterior /product/jort-galaxy-maiz-claro-30-maiz-claro-30 sin producto equivalente.
- URL anterior /product/jort-galaxy-maiz-oscuro-30-maiz-oscuro-30 sin producto equivalente.
- URL anterior /product/jort-galaxy-maiz-claro-32-maiz-claro-32 sin producto equivalente.
- URL anterior /product/jort-galaxy-maiz-oscuro-32-maiz-oscuro-32 sin producto equivalente.
- URL anterior /product/pantalon-corduroy-clasico sin producto equivalente.
- URL anterior /product/pantalon-corduroy-clasico-verde-l-verde-l sin producto equivalente.
- URL anterior /product/pantalon-corduroy-clasico-beige-l-beige-l sin producto equivalente.
- URL anterior /product/pantalon-corduroy-clasico-negro-m-negro-m sin producto equivalente.
- URL anterior /product/blusa-urban sin producto equivalente.
- 19 URLs anteriores sin producto equivalente (quedan en 404).
- Hay dos números de WhatsApp: asesor +51902675269 y phone_whatsapp +51965744589. Se usó el del asesor; confirmar con TWENTY.
- El cintillo promete entrega en 48 horas en Lima, pero la política de envíos dice "1 a 5 días hábiles" y S/ 15 fijo. Confirmar con TWENTY.
- Tipo de envío "envio gratis" (manda tu motorizado) se ofrece dentro de "Recojo en tienda".
- 1893 distritos cargados; 44 con delivery Lima (el resto, agencia o recojo).

## Contenido (blog, páginas legales, Nosotros)

- Empresa: Multiventa Peruano S.A.C. (RUC 20612934020), dirección de la tienda como domicilio. Los avisos de reclamos llegan a twentymodagamarra@gmail.com (correo corporativo). Confirmar con TWENTY.
- La política de privacidad publicada era una plantilla genérica con campos sin llenar ([Nombre de tu Tienda], [Fecha actual]…) y la nota del generador. Se completó con los datos de TWENTY y se quitó la nota. Debe revisarla un abogado (Ley 29733 de Protección de Datos Personales).
- Los términos y condiciones dan otro WhatsApp de contacto (973018261) y un horario de 11:00 a 7:00; la web usa De Lunes a Domingo de 10:00am a 8:00pm. Confirmar con TWENTY.
- La tabla de la política de envíos se veía aplastada en un solo párrafo; se reescribió como lista con los mismos datos. Dice delivery Lima S/ 15 fijo, pero el checkout cobra por distrito (Admin → Envíos). Confirmar con TWENTY.
- Nosotros: 1 fortaleza(s) sin publicar o sin texto no se migraron.
- Preguntas frecuentes: se omitieron 2 de relleno ("Donec in pulvinar…") o inactivas.
- Había enlaces al dominio de pruebas del proveedor anterior (twenty-ecommerce.mundoweb.pe); se cambiaron a /catalogo.
- Blog: el meta title y la meta description anteriores estaban cortados a mitad de palabra y la URL canónica apuntaba al dominio del proveedor; se generan a partir del título y el primer párrafo.
