# app-minimarket

Sistema web para Minimarket Santa Ana construido con Next.js, TypeScript,
Tailwind CSS y Supabase.

## Modulos V1

- Dashboard operativo
- Productos: CRUD, busqueda, importacion CSV e imagen en Supabase Storage
- Clientes rapidos
- Pedidos manuales con detalle, captura Yape y resumen WhatsApp
- Pagos Yape: validar o rechazar capturas
- Preparacion: responsable, descuento de stock, checklist y entrega

## Stack

- Next.js App Router
- TypeScript
- Tailwind CSS
- ESLint
- Supabase Database y Storage

## Variables de entorno

Crear `.env.local` desde `.env.local.example`:

```bash
cp .env.local.example .env.local
```

Variables necesarias:

```env
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
NEXT_PUBLIC_WHATSAPP_NEGOCIO=
```

No usar service role key en frontend.

## Desarrollo local

```bash
npm install
npm run dev
```

El script `dev` usa Webpack para evitar problemas locales con Turbopack en
Windows/OneDrive:

```bash
next dev --webpack
```

## Verificacion

```bash
npm run lint
npm run build
```

## Supabase

Las migraciones SQL estan en `supabase/migrations/`.

Buckets usados:

- `productos`: imagenes de productos
- `pagos`: capturas de Yape

## Deploy en Vercel

1. Subir el repositorio a GitHub.
2. En Vercel, elegir `Add New Project` e importar el repositorio de GitHub
   `app-minimarket`.
3. Configurar variables de entorno en Vercel:
   - `NEXT_PUBLIC_SUPABASE_URL`
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   - `NEXT_PUBLIC_WHATSAPP_NEGOCIO`
4. Framework preset: `Next.js`.
5. Build command: `npm run build`.
6. Output directory: dejar el valor automatico de Next.js.
7. Deploy.

Cada push a la rama principal (`main` o `master`, segun quede configurado en
GitHub) dispara un nuevo deploy automaticamente en Vercel.

`.env.local`, `.next` y `node_modules` estan excluidos por `.gitignore`.

## Subir a GitHub

Si el repositorio remoto aun no esta configurado:

```bash
git remote add origin https://github.com/TU_USUARIO/app-minimarket.git
git branch -M main
git push -u origin main
```

Si el remoto ya existe:

```bash
git push
```

## Nota pendiente

El acceso `Agregar boleta de compra` esta preparado, pero el modulo completo de
compras requiere tablas de proveedores, compras y detalle de compra para generar
entradas de stock.
