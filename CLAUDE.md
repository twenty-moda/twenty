# TWENTY (twentymoda.com): nueva tienda full-stack en Next.js + Postgres

Este kit tiene todo lo que se sacó de la plataforma anterior (Laravel + React, hosteada en cPanel). La meta es construir **desde cero** la tienda de TWENTY en una sola app Next.js full-stack (tienda pública + panel admin, sobre PostgreSQL), migrando sus datos y manteniendo su marca y sus URLs para no perder SEO. Ver "Arquitectura decidida" más abajo.

## Reglas del proyecto
1. **`reference/laravel-actual/` es solo una referencia de qué hace cada cosa. No portes su código línea por línea.** Hay una disputa con el proveedor anterior sobre ese código: la implementación nueva tiene que ser original. Los **datos** (`db/`) y los **assets** (`assets/`, `brand/`) sí son de Twenty Moda y se usan tal cual.
2. `db/*.sql` tiene **datos personales de clientes** (nombres, emails, teléfonos, DNI, direcciones, hashes de contraseña). No lo subas a git, no lo pegues en issues ni en logs y no lo uses en fixtures. Para seeds de desarrollo usa `db/catalog_json/` + `db/config_json/`. Del dump completo solo salen usuarios y pedidos, y únicamente en la migración final a producción.
3. No hay secretos en este kit. En el código original había una clave privada RSA escrita directamente en `Controller.php` y una API key de Google Maps en `.env.example`: están redactadas y **no deben reutilizarse**. Todas las claves (Culqi, Google OAuth, Google Maps, TinyMCE) **se rotan** y van en variables de entorno nuevas.
4. El frontend compilado viejo (`reference/frontend-compilado/`) solo sirve para inspeccionar pantallas o textos si hace falta. No lo reutilices.
5. **Subir sin consultar (pedido de Mathyu, 24/09/2026):** al terminar cada cambio, hacer commit y `git push origin main` sin preguntar, siempre que pasen typecheck, lint, tests y build. Cada push a `main` despliega a producción. Si el cambio trae una migración, aplicarla antes en las dos ramas de Neon (production y preview).

## Mapa del kit
| Ruta | Qué hay |
|---|---|
| `db/twentymoda_db.sql(.gz)` | Dump completo MariaDB 11.4 (106 tablas, 51 con datos) |
| `db/schema_mysql.sql` | Solo los `CREATE TABLE` |
| `db/row_counts.json`, `docs/DATOS.md` | Filas por tabla y agrupación por dominio |
| `db/catalog_json/*.json` | **Catálogo y envíos sin datos personales**: items (solo columnas de moda), item_images, item_attribute, item_specifications, item_tags, delivery_prices. Úsalos para seeds y para desarrollar. |
| `db/config_json/*.json` | Tablas de configuración/contenido sin datos personales (generals, categorías, tags, atributos, estados, tipos de envío, tienda, sliders, posts, faqs, reglas de descuento…) |
| `brand/` | Logos TWENTY (WebP y JPG), `colors.json`, `tokens.css`, `BRAND.md` |
| `assets/images/<carpeta>/` | Imágenes que referencia la BD por nombre de archivo (1,023 archivos). `item/` = fotos de producto |
| `assets/photoshoot/TMW-0098.zip` | 493 fotos de producto originales (webp, 250 MB) |
| `assets/public/` | Íconos de pago, libro de reclamaciones, botón WhatsApp, QR billetera, etc. |
| `assets/seo/` | `sitemap.xml`, `robots.txt`, `products-feed.json` (catálogo Google/Meta), `llms.txt` |
| `reference/laravel-actual/` | Backend anterior (app, routes, database/migrations, config, views, css, `.env.example`) |

## El negocio en datos
- Moda urbana juvenil. Envío en 48 h en Lima Metropolitana y envíos a provincias. Moneda: PEN (tipo de cambio USD guardado: 3.75).
- **Catálogo:** 387 `items` = **variantes** (SKU `TMW-0001`…), agrupadas en **46 productos** por el campo `agrupador`. Cada variante tiene un valor de **Género, Color y Talla** en `item_attribute` → `attributes`. Una fila de `items` = un color + una talla. Ojo: 70 items no tienen `agrupador` y `item_attribute` tiene filas huérfanas de items que ya no existen (960 filas de 320 items borrados). Además, 43 items no tienen atributos. Límpialo en la migración. Precios entre S/ 30 y S/ 120 (`price`, `discount`, `final_price`), con stock por variante.
  - Categorías: PANTALONES, CAMISA, HOODIE, ZIP HOODIE, JACKET, PUFFER, POLOS/POLO, JORTS, CHOMPA, Blusa. Subcategorías de corte/fit: BAGGY JEAN, SÚPER BAGGY, FLARED JEAN, MOM JEAN, OVERSIZE, BOXI FIT, REGULAR FIT, SLIM FIT, OVERBOX, SASTRE, etc. (relación N:N en `category_sub_category`; hay nombres repetidos y una "Sub categoria nueva" de prueba: depurar).
  - Imágenes: `items.image` y `item_images.url` guardan el **nombre de archivo** (`TMW-0001.webp`), que está en `assets/images/item/`. 793 referencias, 1 archivo faltante.
  - Tags: promos ("Black Friday", "Oferta Flash") y tags técnicos "Regla: …" ligados a reglas de descuento.
- **Promociones:** `discount_rules` activas de tipo `quantity_discount` ("2 X 100", "CAMISA2X100", "POLOS4X100", "POLSLIMFIT4X100", "BAGGYLASERBRILLO2X120"); la lógica está en `conditions`/`actions` (JSON). `coupons` porcentaje o monto fijo (hoy inactivos).
- **Envíos:** `delivery_prices` tiene **1,893 filas, una por distrito (`ubigeo` INEI de 6 dígitos)**, con flags gratis/express/agencia/recojo. `types_delivery`: envío gratis, Delivery Lima, Envío Shalom, Envío Olva, Retiro en tienda. Hay 1 tienda física (`stores`).
- **Pagos:** Culqi (tarjeta + Yape) activo, y "billetera digital" (QR de Yape con subida de comprobante) activa. MercadoPago, OpenPay y transferencia están desactivados. Checkout **sin login obligatorio** (`checkout_require_login=false`).
- **Pedidos:** 14 `sales` con `sale_details` y trazabilidad en `sale_status_traces`. Estados: Pendiente, Pagado, Pagado - Por verificar, Pagado - Por revisión, En producción, Enviado, Entregado, Anulado, Rechazado. Los pedidos guardan boleta/factura (`invoiceType`, `documentType`, `document`, `businessName`).
- **Usuarios:** 18. Roles: Admin, Root, Customer.
- **Contenido editable:** `generals` es un key-value (`correlative` → `description`) con textos legales (términos, privacidad, envíos, devoluciones), plantillas de email, pixels de marketing (GA, GTM, Meta, TikTok…), toggles de pago y SEO. Ver `db/config_json/generals.json`.
- **Obligatorio en Perú:** Libro de Reclamaciones (hoy existe la tabla `complaints`, vacía).

## URLs públicas actuales (conservar o redirigir con 301)
`/`, `/catalogo`, `/product/{slug}` (230 en el sitemap), `/cart`, `/nosotros`, `/blogs`, `/post/{slug}` (7), `/contacto`. También hay que mantener `products-feed.json` (feed de catálogo), `robots.txt` y `llms.txt`.

## Notas para migrar MySQL → Postgres
- Los IDs son `char(36)` UUID → `uuid`. `users.id` es `bigint`. **Conserva los IDs** para no romper las relaciones entre pedidos, trazas e imágenes.
- `tinyint(1)` → `boolean`. Hay campos `longtext` que guardan JSON (`banners`, `faqs`, `conditions`, `actions`, `applied_promotions`, `business_hours`, `gallery`, `options`, `combo_data`…) → `jsonb`.
- Contraseñas: bcrypt de Laravel con prefijo `$2y$`. Las contraseñas viven en Firebase: en la migración final se importan con `npx firebase-tools auth:import usuarios.json --hash-algo=BCRYPT --project twenty-moda` (mismo algoritmo, cambiando el prefijo a `$2b$`), así nadie tiene que resetear su contraseña. Se guardan en `users.password_hash` solo como origen de esa importación.
- `items` tiene muchas columnas de otros rubros (habitaciones, proveedores, etc.): no las migres.
- Hay dos caminos para cargar: `pgloader` directo desde un MariaDB local con el dump, o un script que lea `twentymoda_db.sql` y cargue solo las tablas del esquema nuevo (recomendado, porque el esquema nuevo será más limpio).

## Arquitectura decidida: una sola app Next.js full-stack, propiedad de TWENTY
Todo el software es **de Twenty Moda** y para una sola tienda: sin multi-tenancy ni abstracciones para otros clientes. El repositorio se crea **en la cuenta u organización de GitHub de Twenty Moda desde el día 1**, con Mathyu como colaborador. (Esto es justo lo que faltó con el proveedor anterior.)

Una sola app **Next.js (App Router, TypeScript)** con la tienda pública y el panel admin en `/admin`. No hay backend separado.

```
src/
  app/
    (store)/         Tienda pública: /, /catalogo, /product/[slug], /cart, /checkout, /nosotros, /blogs, /post/[slug], /contacto, /cuenta, /tracking, /libro-de-reclamaciones
    admin/           Panel admin (protegido por rol): productos, variantes, stock, pedidos, promos, contenido, envíos
    api/             Solo lo que necesita ser endpoint: webhooks de Culqi, cron, feed de productos, sitemap
  server/
    services/        Lógica de negocio en TypeScript puro (catálogo, carrito, precios y promociones, envíos, checkout, pedidos). Sin imports de Next.
    db/              Esquema Drizzle, migraciones, cliente con pooling
  lib/               Utilidades compartidas, validaciones Zod
  components/        UI (tienda y admin)
```
**Regla:** los route handlers, server actions y server components solo llaman a `server/services`. Nada de lógica de negocio dentro de ellos. Así, si algún día hace falta una API separada (por ejemplo, para una app móvil), se lleva `services` a NestJS sin reescribir.

### Requisitos de rendimiento (objetivo: cientos de usuarios a la vez, picos en drops y Black Friday)
1. **Catálogo estático + CDN:** home, catálogo y fichas de producto con ISR. Al editar en el admin, se invalida con `revalidateTag` solo lo que cambió. El tráfico de navegación no debe llegar a la base de datos.
2. **Pooling de conexiones a Postgres:** usar el pooler de Neon o Supabase (o su driver HTTP). Nunca conexiones directas por instancia serverless.
3. **Stock atómico:** crear el pedido y descontar stock en la **misma transacción**, con `UPDATE ... SET stock = stock - :qty WHERE id = :id AND stock >= :qty`. Si no se afecta ninguna fila, falla sin vender. Test de concurrencia obligatorio (N compras simultáneas de la última unidad → solo 1 éxito).
4. **Jobs sin servidor:** emails, reintentos de webhooks y expiración de pedidos pendientes con Vercel Cron + una cola (QStash o Inngest). Los webhooks de Culqi tienen que ser idempotentes.
5. **Imágenes:** servir desde R2/S3 con CDN, conservando los nombres de archivo. Ya son WebP: evitar depender de la optimización de imágenes de Vercel, que se cobra por uso.
6. **Rate limiting** en login, registro, checkout y formularios (Upstash Ratelimit o similar).
7. **Prueba de carga con k6** del flujo catálogo → carrito → checkout antes de salir a producción y antes de cada campaña grande.

### Modelo de dominio (lección de la plataforma anterior)
La plataforma anterior metía columnas de todos los rubros en `items` (habitaciones, camas, proveedores…) y tenía 55 tablas vacías de otros clientes. **Aquí solo va lo que TWENTY usa**, bien modelado:
- Producto → variantes → opciones (Talla, Color, Género) con SKU, precio y stock por variante. Hoy cada fila de `items` es una variante y el producto se deduce por `agrupador`: en el esquema nuevo el producto es una entidad propia.
- Categorías y subcategorías (fit), tags, promociones con reglas en JSON (cubre los "N x S/"), cupones, tarifas de envío por ubigeo y tipo, tienda física para recojo, pedidos con historial de estados, contenido (textos legales, sliders, FAQs, blog), suscriptores, mensajes de contacto y libro de reclamaciones.

### Stack
Next.js App Router + TypeScript + Tailwind (`brand/tokens.css`, Libre Franklin con `next/font`) · Drizzle ORM + PostgreSQL gestionado (Neon o Supabase) con pooling · Auth.js (credenciales con bcrypt compatible con los hashes migrados; roles Admin/Customer) · Zod · R2 o S3 para imágenes · Culqi (tarjeta + Yape) · Resend o similar para emails · Vercel (hosting + Cron) · Upstash (rate limit / QStash) · k6 para pruebas de carga.

## Plan por fases
0. **Base:** proyecto Next.js, Drizzle + Postgres con pooling, Auth.js con roles, layout del admin protegido, CI (lint, typecheck, tests).
1. **Catálogo en el admin:** productos, variantes, opciones, categorías, imágenes y stock, con `server/services` y tests.
2. **Migración de datos:** script desde `db/catalog_json/` + `db/config_json/` (y del dump solo usuarios y pedidos en el paso final), subida de `assets/images/` a storage y limpieza de datos sucios.
3. **Tienda pública:** home, catálogo con filtros (categoría, fit, talla, color, género), ficha de producto con selector de variantes, ISR y las mismas URLs que hoy.
4. **Carrito y checkout:** envío por ubigeo y tipo, promociones "N x S/", cupones, Culqi y billetera QR con comprobante, boleta o factura, checkout sin login, stock atómico, webhooks idempotentes.
5. **Pedidos:** gestión de estados en el admin, cuenta del cliente, tracking y emails transaccionales con cola.
6. **SEO, carga y cutover:** mismas URLs o redirecciones 301, sitemap, feed de productos, metadatos (corregir el `<title>` heredado "Tecnología para tu día a día"), pixels, rate limiting y prueba de carga con k6. Al cambiar el DNS **mantén los registros MX** (el correo @twentymoda.com vive en el cPanel).

## Estado del código (la app vive en la raíz de este kit)
- **Tienda:** home, `/catalogo` con filtros, `/promos` (pedido de TWENTY, 24/09/2026: cada promo "N x S/" con sus prendas + las rebajadas, armado en `src/lib/promos.ts`; el enlace "Promos" sale en el menú, el catálogo, el buscador y el footer solo si hay alguna), `/product/[slug]`, `/cart`, `/checkout` en 3 pasos (entrega primero, como pidió la dueña de TWENTY; luego solo los datos que esa entrega necesita; luego pago) y `/pedido/[id]` (confirmación + estado; el id no se adivina). 308 de las URLs anteriores (`src/server/db/seed/legacy-redirects.json` → `next.config.ts`).
- **Pedidos:** `server/services/orders.ts` crea el pedido y descuenta stock en la misma transacción (`stock >= n`), recalcula precio, promos y envío en el servidor. Test de concurrencia en `orders.int.test.ts`.
- **Conjuntos** (pedido de TWENTY, 25/09/2026): producto con `kind = "outfit"`, precio `outfit_price_cents` y 2 a 4 piezas en `outfit_pieces` (otras prendas del catálogo). El cliente elige color y talla de cada pieza (`OutfitExperience`) y el stock es el de cada prenda, compartido con su venta suelta.
  - Carrito: la línea usa la clave `conjunto:<id>:<variantes>` (`outfitLineKey`) y lleva `outfit.pieces`; al servidor va `{ outfitId, variantIds }` (`lineItem`).
  - `placeOrder` suma lo que pide cada variante (suelta más conjuntos) y lo descuenta en la misma transacción. En `order_items` va una fila por pieza (`outfit_id`, `outfit_name`, `outfit_line`) con el precio del conjunto repartido (`allocateOutfitPrice`); `groupOrderItems` las junta en la página del pedido, el panel y los emails. Tests en `outfits.int.test.ts`.
  - No entran en las promos "N x S/" ni en las rebajas de `/promos`. Una pieza en borrador se vende solo dentro del conjunto; una archivada deja el conjunto sin vender; una prenda que es pieza no se puede borrar. La migración 0011 crea la categoría "Conjuntos". La ficha del conjunto se invalida también con los tags de sus piezas.
- **Admin `/admin`:** se entra con la misma cuenta de la tienda (Google o correo y contraseña, ver "Cuentas") si tiene rol admin; pedidos con estados e historial, clientes, productos (variantes color × talla, fotos por color), stock y precios en bloque, carga masiva por Excel (plantilla nueva y la anterior de TWENTY) + fotos por SKU, promociones, categorías, contenido de la web y envíos.
- **Decisión:** en lugar de Auth.js (v5 nunca salió de beta y el proyecto pasó a Better Auth) se usa un módulo propio pequeño para las sesiones: tabla `sessions` con `scope` `admin` (cookie `twenty_session`) o `cuenta` (cookie `twenty_cuenta`). Una sesión de la tienda nunca vale para el panel, aunque la persona sea admin: el panel pide entrar en `/admin/login`. En nuestra BD no se guardan ni se comparan contraseñas.
- **Cuentas (pedido de TWENTY, 24/09/2026):** **una sola cuenta por email** para la tienda y el panel. Se entra con **Google o con correo y contraseña** usando **Firebase Authentication**, pero Firebase solo confirma quién es:
  - `components/account/firebase-sign-in.tsx` (en `/ingresar` con `mode="store"` y en `/admin/login` con `mode="admin"`): Google, ingresar, crear cuenta (con confirmación del correo: sin confirmarlo no entra), reenviar el correo y «¿Olvidaste tu contraseña?». El SDK se carga solo ahí (`firebase-client.ts`), con persistencia en memoria, y los correos de Firebase salen en español.
  - Si un correo ya tiene contraseña y la persona entra con Google (o al revés), Firebase une los métodos (una cuenta por email, configuración por defecto). Si no puede unirlos solo (`auth/account-exists-with-different-credential`), se pide entrar con la contraseña y ahí se vincula Google. En `/cuenta/datos` se puede crear o cambiar la contraseña (llega un enlace al correo), así quien entró con Google también puede usar su correo.
  - El navegador manda el ID token a `signInWithFirebaseAction` (tienda) o `adminSignInAction` (panel). El servidor lo verifica con las llaves públicas de Google (`_lib/sign-in.ts` → `server/services/firebase-auth.ts`, con `jose`, sin cuenta de servicio): proyecto, vencimiento, email verificado, proveedor `google.com` o `password` e ingreso de hace menos de 10 min.
  - `accounts.signInWithFirebase` busca la cuenta por `users.firebase_uid` o por email (vincula cuentas que ya existían sin cambiarles el rol). La tienda crea la cuenta de cliente la primera vez; el panel solo deja entrar a cuentas con rol admin. El rol se da en **Admin → Equipo** (`grantAdmin`, con correo de invitación opcional; también `pnpm admin:create`) y se quita ahí (`revokeAdmin`: vuelve a cliente y se cierran sus sesiones del panel; nadie se quita a sí mismo ni al último admin). La persona entra con Google o crea su contraseña con «Crear contraseña».
  - `/cuenta` = mis pedidos (los hechos con ese email, también los de antes de tener cuenta), `/cuenta/direcciones` (tabla `addresses`: delivery en Lima o agencia en provincia, máx. 10, una principal) y `/cuenta/datos` (el registro de `customers` con ese email, el mismo que llena cada compra).
  - El checkout pide la cuenta con `getCheckoutAccountAction` al cargar (sigue estático): llena los datos, ofrece las direcciones guardadas y, al comprar, guarda la dirección nueva si se deja marcado.
  - Comprar sin cuenta sigue igual. Google no deja entrar desde el navegador de Instagram, Facebook o TikTok: `/ingresar` lo detecta y sugiere abrir la página en Chrome o Safari (con correo y contraseña sí se puede ahí).
- **Firebase:** proyecto `twenty-moda` (cuenta de Google de TWENTY), app web "TWENTY tienda web". Config en `NEXT_PUBLIC_FIREBASE_*` (pública por diseño; copia local en `.env.firebase`, ignorado por git; en Vercel solo Production).
  - Google y correo/contraseña se activaron con `npx firebase-tools deploy --only auth --project twenty-moda` usando un `firebase.json` con `auth.providers.googleSignIn` (nombre "TWENTY" y email de soporte de TWENTY) y `emailPassword: true`. Ese archivo no está en el repo. Tiene la protección contra enumeración de emails activada: «¿Olvidaste tu contraseña?» no dice si el correo tiene cuenta. Las plantillas de los correos (remitente, asunto) se editan en Firebase → Authentication → Templates.
  - La cuenta de admin de TWENTY tiene Google y contraseña (se le agregó en Firebase la misma que tenía en el panel).
  - Dominios autorizados: localhost, twentymoda.vercel.app, twentymoda.com y www.twentymoda.com. Si la tienda se abre en otro dominio, agregarlo en Firebase → Authentication → Settings; si no, Google responde `auth/unauthorized-domain`. Por eso los despliegues de Preview no tienen ingreso.
  - El binario `firebase` instalado en este Mac es para Intel: usar `npx -y firebase-tools@latest`.
- **Pagos:** Culqi (tarjeta y Yape) en `/pedido/[id]` con Culqi Checkout (`js.culqi.com/checkout-js`) + 3-D Secure (`3ds.culqi.com`); el cargo lo crea `server/services/payments.ts` (201 = pagado, 200 + `action_code: "REVIEW"` = pide 3DS). Webhook `/api/webhooks/culqi?key=…` que re-consulta el cargo en la API (idempotente por `payments.provider_id`). Los pedidos con tarjeta sin pagar a los 60 min se anulan y devuelven el stock en cada checkout (`placeOrderAction` llama a `expireUnpaidCardOrders` antes de vender) y además con el cron `/api/cron/expirar-pedidos` (vercel.json, una vez al día a las 6:00 de Lima porque el equipo está en Vercel Hobby, que no permite crons más frecuentes; protegido con `CRON_SECRET`). También Yape/Plin con QR (captura por WhatsApp). "Coordinar el pago por WhatsApp" se quitó del checkout a pedido de TWENTY (24/09/2026): el valor `whatsapp` sigue en la BD y en la página del pedido y los emails solo por los pedidos anteriores. Como ya no hay ese respaldo, el admin no deja apagar todas las formas de pago.
- **Captura de Yape/Plin** (25/09/2026): el cliente la sube en `/pedido/[id]` (`PaymentProofUpload` → `uploadPaymentProofAction`), el pedido pasa a `por_verificar` y al equipo le llega "Captura de pago recibida" con la imagen dentro del email y adjunta, en JPEG (evento `proof` → team email `comprobante`; también con cada captura nueva del mismo pedido). Se guarda en la BD (`payment_proofs`, WebP de máx. 1400 px) y no en el bucket, porque el bucket es público y la captura trae nombre y celular de quien pagó. La ven el panel (`/admin/comprobantes/[id]`) y el cliente con su enlace (`/pedido/[id]/captura/[proofId]`). Máximo 5 por pedido y límite por IP; WhatsApp queda como alternativa.
- **Devoluciones** (pedido de TWENTY, 25/09/2026): en el panel del pedido, tarjeta "Devoluciones" → «Devolver dinero» (sin anular el pedido): motivo (prenda agotada, cortesía, el cliente lo pidió u otro con nota interna), todo o un monto, y cómo: **por Culqi** (`POST /v2/refunds`, total o parcial del cargo) o **«ya se lo devolví por mi cuenta»** (Yape/Plin con QR, o si Culqi no lo permite: solo se registra). Tabla `refunds`.
  - "Prenda agotada": se marcan las prendas y cuántas (`refund_items`), el monto sugerido es lo que se pagó por ellas (con su parte de la promo; más el envío si ya no queda nada) y se puede dejar su stock en 0. Si luego se anula el pedido, esas prendas no vuelven al stock.
  - Al **anular** un pedido pagado, el mismo formulario ofrece devolver todo (primero la devolución; si Culqi no la hace, el pedido no se anula) y el email de "anulado" dice cuánto se devolvió.
  - `server/services/refunds.ts` guarda la fila con el pedido bloqueado **antes** de llamar a Culqi, así nunca se devuelve más de lo pagado (test de concurrencia en `refunds.int.test.ts`). Si Culqi la rechaza se borra; si no responde queda "pendiente" (cuenta como devuelta) y el equipo la confirma o la descarta en el panel después de revisar CulqiPanel.
  - Emails: al cliente "Te devolvimos S/ X" con el motivo (se puede desmarcar) y al equipo. La página del pedido muestra lo devuelto y la prenda agotada; la nota interna nunca sale del panel.
- **Llaves de Culqi:** van en `NEXT_PUBLIC_CULQI_PUBLIC_KEY`, `CULQI_SECRET_KEY`, `CULQI_WEBHOOK_SECRET` (solo en Production de Vercel; en Preview no, para no cobrar de verdad desde despliegues de prueba). Sin ellas, la opción de tarjeta no aparece. **Llave privada renovada** en CulqiPanel el 25/09/2026 (la anterior, a la que tuvo acceso el proveedor de la web vieja, quedó revocada) y cargada en Vercel con `vercel env update … --sensitive` + redespliegue; la pública no cambió. Copia local en `.env.culqi` (ignorado por git), con la URL del webhook para CulqiPanel.
- **Shalom** (`server/services/shalom.ts`, llave `SHALOM_API_KEY`, solo en Production de Vercel; copia local en `.env.shalom`): vía **Shalom API Perú** (`api.shalom-api.lat`), un servicio **de terceros** (no de Shalom) con cuota mensual (9.999 consultas).
  - **Agencias en el checkout:** al elegir Shalom el cliente busca la agencia (ciudad, distrito o dirección, o "cerca de mí" con la ubicación) en `ShalomAgencyPicker`, en lugar de escribirla. La lista sale de `/api/shalom/agencies` (`getShalomAgencies`, caché de un día; si Shalom falla, unos minutos y el checkout vuelve al texto libre). El servidor toma el nombre y el distrito oficiales de la agencia por su `ter_id` (`resolveShalomAgency`) y los guarda en `orders.agency_id`/`agency_name`. También se usa en las direcciones guardadas de la cuenta (`addresses.agency_id`).
  - **Ubigeo:** nuestra tabla `districts` (de la web anterior) usa el código de **RENIEC** (Lima = 14…) y Shalom el del **INEI** (Lima = 15…): las agencias se emparejan por nombre de departamento, provincia y distrito (`districtIndex`, con prefijos porque Shalom corta los nombres a 20 letras y algunos alias como Ate-Vitarte → Ate). Las 494 agencias que reciben envíos quedan ubicadas.
  - **Seguimiento:** en el panel, al marcar como enviado un pedido de Shalom (o en su tarjeta de entrega) se anota la guía: N° de orden (8 dígitos) y código (4). Va en el email de "enviado" y la página del pedido (y el panel) muestran los pasos del envío (`getShalomTracking`, caché de 15 min por guía). La respuesta de Shalom trae nombres y documentos del remitente y del destinatario: `parseTracking` solo copia los pasos y fechas.
  - **Pendiente:** crear la guía en Shalom Pro desde el panel (la API lo permite, pero pide conectar la cuenta de Shalom Pro de TWENTY con su usuario y contraseña en ese servicio de terceros) y el webhook de Shalom para marcar "entregado" solo.
- **Promos "N x S/":** misma regla que la plataforma anterior (con N o más, cada prenda a precio/N), en `src/lib/pricing.ts`.
- **Páginas de contenido:** `/nosotros`, `/blogs` + `/post/[slug]`, `/contacto` (formulario + preguntas frecuentes), `/tracking` (solo el número de pedido → estado, fechas y forma de entrega, sin datos personales porque el número es correlativo: `getOrderTracking`; para ver prendas, dirección y pago se confirma el celular o email → `/pedido/[id]`; límite por IP), las 4 legales (`/terminos-y-condiciones`, `/politica-de-privacidad`, `/politicas-de-envio`, `/politicas-de-devolucion-y-cambio`) y `/libro-de-reclamaciones`. Todo se edita en Admin → Contenido / Blog. Los textos usan un formato simple tipo Markdown (`src/lib/rich-text.ts`, se muestra con `<RichText>`; nunca HTML).
- **Libro de Reclamaciones:** hoja con número correlativo (`complaints.number`, código `LR-AAAA-00001`), constancia imprimible en `/libro-de-reclamaciones/constancia/[id]`, respuesta desde `/admin/reclamos` con el plazo de 15 días hábiles (`src/lib/business-days.ts`, con feriados de Perú). Las hojas no se borran (hay que guardarlas 2 años).
- **Emails:** `server/services/email.ts` (Resend por HTTP, `RESEND_API_KEY` + `EMAIL_FROM`, reintento en 429/5xx, `Idempotency-Key`). Diseño en `email-layout.ts`: el email es una lista de bloques que se convierte a HTML con tablas (franja negra con `public/brand/twenty-logo-email.png`) y a texto plano. Las fotos del bucket (WebP) van en JPEG por `/api/email-image/<ruta>?w=` (Outlook de escritorio no muestra WebP; queda en el CDN porque cada archivo tiene nombre único). Se envían con `after()` para no demorar la respuesta. En los logs nunca va el asunto ni el destinatario (datos personales): solo el `tag`.
  - **Pedidos** (`order-notifications.ts` decide, `order-emails.ts` arma el contenido, `src/server/order-events.ts` los manda con `after()`): cliente = confirmación al comprar con Yape/Plin (con tarjeta, al confirmarse el pago) y un email por cada avance (los retrocesos no); equipo = admins activos + `company.notificationEmail` (o el de contacto) en cada pedido nuevo (con tarjeta, cuando Culqi lo paga) y cada anulación o rechazo, sin el admin que hizo el cambio. Los pedidos con tarjeta anulados solos a los 60 min solo avisan al cliente. `changeOrderStatus` devuelve `change` (`StatusChange`) y quien lo llame debe pasarlo a `notifyAfterResponse`. En el panel, al cambiar el estado se puede escribir un "mensaje para el cliente" (`order_status_history.customer_message`: va en el email y en `/pedido/[id]`) y desmarcar el aviso.
  - Los enlaces usan `appUrl()` (`src/lib/links.ts`): el dominio de producción de Vercel (twentymoda.vercel.app hasta el cambio de DNS, luego twentymoda.com), no `NEXT_PUBLIC_SITE_URL`.
  - **Remitente:** `TWENTY <pedidos@twentymoda.com>` en Vercel (Production). twentymoda.com está verificado en Resend (24/09/2026: DKIM `resend._domainkey`, subdominio `send` y DMARC `p=none` en HostGator; el MX principal no se tocó). La llave es "Sending access": no gestiona dominios. Plan gratis: 100 emails/día y 3.000/mes.
- **Mensajes de contacto:** se responden desde el panel con un solo texto, por email (Resend, `sendContactReply`; si el cliente contesta, llega al email de contacto) o por WhatsApp si dejó su celular. Las respuestas se guardan en `contact_replies` y el mensaje pasa a atendido.
- **Fotos del admin:** cada subida dice la medida ideal según cómo se ve en la tienda (`src/lib/image-specs.ts`) y avisa si la foto es chica o se va a recortar. El formato da igual: el servidor convierte todo a WebP (`server/storage.ts`).
- **Formularios públicos:** límite por IP en BD (`server/services/rate-limit.ts`, se guarda un hash de la IP) + campo trampa `website` para bots.
- **SEO:** `sitemap.xml`, `robots.txt`, `products-feed.json` (mismo formato que el anterior) y `llms.txt` se generan desde la BD. Redirecciones de URLs viejas (`/libro-reclamaciones`, `/storage/images/…`, `/api/<tabla>/media/…`) en `next.config.ts`.

## Convenciones de la app
- **Caché (Next 16, Cache Components):** las lecturas de la tienda están en `src/app/(store)/_data.ts` con `'use cache'` + `cacheTag` (`src/lib/cache-tags.ts`). Al editar desde el admin: `updateTag(cacheTags.product(slug))` o `updateTag(cacheTags.catalog)`. Nada de `new Date()` ni lecturas sin caché fuera de `<Suspense>`: rompe el prerender.
- **Estado en la URL sin servidor:** filtros del catálogo y variante elegida (`?color=&talla=`) usan `useUrlSearch` (`src/lib/use-url-search.ts`), no `useSearchParams`, para que el HTML siga siendo estático. El hook escucha `history.pushState/replaceState` (Next no emite eventos): sin eso, un `<Link>` a la misma página con otra query (menú → otra categoría) no actualizaba el filtro.
- **Animaciones (solo CSS del navegador, sin librerías):** clase `reveal` = aparece al hacer scroll (scroll-driven, en `globals.css`); transición de página con `<PageTransition>` en los `template.tsx` de `(store)`, `product/` y `post/`; la foto de la tarjeta "vuela" a la ficha con `<ViewTransition name=…>` (`productMorphName`/`postMorphName`): el nombre debe ser **único en la página** (por eso `ProductCard morph` es opcional) y la tarjeta usa `prefetch` para que la ficha llegue completa. Los paneles (`Sheet`) animan entrada y salida con `dialog.sheet` + `@starting-style`. Todo se desactiva con "reducir movimiento".
- **Botón flotante de WhatsApp (`WhatsAppFloat`, en el layout de la tienda):** se apaga en Admin → Contenido → Contacto (`contact.whatsappFloat`). Desde una ficha, el mensaje lleva el enlace de la prenda. Por CSS (`.whatsapp-float` en `globals.css`) sube sobre las barras de compra fijas del teléfono (marcadas con `data-sticky-bar="md|lg"`, según cuándo se ven) y se oculta donde haya `[data-hide-whatsapp]` (el checkout). Una barra fija nueva abajo tiene que llevar `data-sticky-bar`.
- **Pantalla de carga (`SplashScreen`, en el layout de la tienda):** logo con brillo y barra de progreso hasta que cargan las fotos visibles y la tipografía (mínimo 450 ms, máximo 3 s), y sale como cortina. La maneja un script en línea que marca `<html data-splash="in|out|done">` antes de hidratar (por eso `<html suppressHydrationWarning>`); sin JavaScript no aparece. Solo en cargas completas: el layout no se vuelve a montar al navegar.
- **Drizzle y subconsultas:** en un select de una sola tabla Drizzle escribe las columnas sin tabla (`"id"`), así que dentro de `(select … from order_items where order_id = ${orders.id})` ese `"id"` es el de `order_items` y el resultado sale vacío. Usar `ORDERS_ID` (`server/services/orders.ts`) o escribir la tabla.
- **Botones de confirmar:** si un botón `type="button"` («Anular pedido») se cambia en el mismo lugar por uno `type="submit"` («Sí, anular»), cada uno necesita su propia `key`. Si React reusa el `<button>` y le cambia el type durante el clic, el navegador envía el formulario con ese mismo toque y se salta la confirmación (pasaba al anular pedidos).
- **Precios en céntimos** (`priceCents`), formato con `formatPrice` (`src/lib/money.ts`). Fotos por producto + color; la ruta es relativa al bucket (`item/TMW-0001.webp`) y la resuelve `src/lib/image-loader.ts`.
- **Estilo:** tema oscuro de la marca (tokens en `src/app/globals.css`), botones de 44 px o más, paneles con `<Sheet>` (`<dialog>` nativo). Un `<fieldset>` con filas deslizables necesita `min-w-0`.
- **Responsive (mobile first, probado de 280 px a 2560 px):** los estilos base son para teléfono; `md` (768) = tablet (ficha de producto en 2 columnas), `lg` (1024) = escritorio (menú de categorías, resumen lateral del checkout), `2xl` (1536) = contenedor ancho `2xl:max-w-[96rem]` y catálogo a 5 columnas. Reglas:
  - Toda grilla de una columna lleva `grid-cols-1`: sin eso la columna crece con el texto más largo (un distrito, una fila de pedido) y la página se desborda en teléfonos chicos.
  - Todo lo que se toca mide 40 px o más de alto (`min-h-10`); para achicarlo con mouse usar `pointer-fine:`, no `lg:` (un iPad horizontal también es `lg` y es táctil).
  - Títulos grandes con `display-title` (tamaño fluido y corte con guion de palabras largas).
- Antes de tocar APIs de Next, leer `node_modules/next/dist/docs/` (ver `AGENTS.md`): esta versión cambia mucho.

## Desarrollo local
```
cp .env.example .env.local
pnpm install
pnpm db:setup       # Postgres en Docker (puerto 5433) + migraciones + seed
ln -sfn ../assets/images public/media   # fotos locales (si no existe el symlink)
pnpm admin:create --email tu@correo.com --name "Tu nombre"   # acceso al panel: entra con Google o «Crear contraseña» en /admin/login
pnpm db:seed:demo   # opcional: pedidos ficticios para ver el admin con datos
pnpm dev            # http://localhost:3000 (admin en /admin)
pnpm test | pnpm test:int | pnpm lint | pnpm typecheck | pnpm build
```
**Producción (Neon + Vercel):** la BD es el proyecto Neon `little-flower-65465312` (cuenta de TWENTY, rama `production`, AWS us-east-1, igual que las funciones de Vercel en `iad1`). Sus URLs están en `.env.neon` (ignorado por git, Next no lo carga solo). En Vercel, `DATABASE_URL` = la URL **con pooler** (`-pooler` en el host); para migrar o cargar datos se usa la directa:
```
DATABASE_URL="$(grep '^DATABASE_URL_UNPOOLED=' .env.neon | cut -d= -f2- | tr -d '"')" pnpm db:migrate
```
Ojo: `neon link`, `vercel link` y `vercel blob create-store` escriben en `.env.local` (este último lo **reemplaza entero**); si se vuelven a correr, restaurarlo desde `.env.example` y devolver `DATABASE_URL` a la BD de Docker.

**Imágenes (Vercel Blob):** store público `twenty-media` (`store_aBAb8Q5RsCJSFi6X`, región `iad1`), conectado a Production y Preview; `NEXT_PUBLIC_MEDIA_URL=https://abab8q5rscjsfi6x.public.blob.vercel-storage.com`. `server/storage.ts` usa Blob si hay `BLOB_READ_WRITE_TOKEN`, si no R2 (`R2_*`), si no la carpeta local. Cada archivo tiene nombre único y caché de un año (las fotos por SKU se guardan como `item/TMW-0001-<8 hex>.webp` y reemplazan la anterior). Para subir las imágenes que usa la BD: `DATABASE_URL=<neon directa> BLOB_READ_WRITE_TOKEN=<token de Vercel> pnpm media:upload` (salta las que ya están). Plan Hobby: 1 GB, 2.000 escrituras y 10 GB de transferencia al mes, y si se pasa **Blob se bloquea 30 días**: antes de vender, pasar a Vercel Pro. `vercel blob put` falla en Node 26 (bug de la CLI): usar `pnpm media:upload`.

**Vercel:** proyecto `twentymoda` del equipo "Twenty" (`twenty10`, plan Hobby), conectado a `twenty-moda/twenty`: cada push a `main` despliega a producción (https://twentymoda.vercel.app hasta conectar el dominio). Funciones en `iad1`. Las variables de Production y Preview son *sensibles*: `vercel env pull` las devuelve vacías, así que se cargan por stdin (`printf '%s' "$VALOR" | vercel env add NOMBRE production --sensitive --yes`). Los despliegues de Preview usan la rama `preview` de Neon (URLs `PREVIEW_*` en `.env.neon`) para no escribir en producción: **cada migración se aplica a las dos ramas.**

`pnpm test:int` usa `TEST_DATABASE_URL` (crear la BD una vez: `docker compose exec db psql -U twenty -c "create database twenty_test"`).
En el admin cada página y cada acción llaman a `requireAdmin()` (`src/app/admin/_lib/auth.ts`); las páginas del admin exportan `instant = false`.
Cambios de esquema: editar `schema.ts` → `pnpm db:generate --name <cambio>` → `pnpm db:migrate`.

@AGENTS.md
