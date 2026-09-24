# Kit de migración: twentymoda.com

Sacado del cPanel el 23/09/2026. Para empezar, abre esta carpeta con Claude Code: `CLAUDE.md` tiene todo el contexto.

- `db/`: base de datos completa. **Tiene datos personales de clientes: no la compartas ni la subas a git** (ya está en `.gitignore`).
- `brand/`: logos, colores y tipografía.
- `assets/`: imágenes del sitio, fotos de producto, archivos de SEO.
- `reference/`: el backend anterior, solo como referencia funcional.
- `docs/DATOS.md`: qué tablas tienen datos y cuántas filas.
- `docs/evidencia/`: lo que se encontró en el código y puede servirle al abogado.

El respaldo completo original sigue en Descargas: `backup-twentymoda.com-9-23-2026.tar.gz` (incluye los correos del cPanel) y `twentymoda_db.sql.gz`. Guárdalos en un lugar seguro.

## La tienda nueva (Next.js 16 + Postgres)

La app vive en la raíz de esta carpeta (`src/`). Requisitos: Node 22 o más, pnpm y Docker.

```
cp .env.example .env.local
pnpm install
pnpm db:setup   # levanta Postgres (Docker, puerto 5433), aplica migraciones y carga el catálogo
pnpm admin:create --email tu@correo.com --name "Tu nombre"   # usuario del panel
pnpm dev        # tienda en http://localhost:3000 · panel en http://localhost:3000/admin
```

Las fotos se sirven en local desde `public/media`, un enlace a `assets/images`. Si no existe: `ln -sfn ../assets/images public/media`.
`pnpm db:seed` deja en `db/seed-report.md` qué datos se corrigieron al migrar el catálogo (conviene revisarlo con TWENTY).
