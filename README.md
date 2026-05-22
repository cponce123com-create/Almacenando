# Almacenando — Sistema de Gestión de Almacén Químico

Aplicación web para gestión integral de almacenes de productos químicos: inventarios, control de calidad, MSDS, compatibilidad química y notificaciones.

## Stack

| Capa | Tecnología |
|------|-----------|
| **Backend** | Express 5 + TypeScript |
| **ORM** | Drizzle ORM + PostgreSQL |
| **Frontend** | React 19 + Vite + TailwindCSS + wouter |
| **Email** | Resend (transaccional) + Nodemailer SMTP (notificaciones internas) |
| **Storage** | Google Drive (MSDS, fotos) + Cloudinary (fotos opcional) |
| **AI** | OpenAI GPT-4o-mini (extracción MSDS) + Gemini 2.0 Flash (compatibilidad química) |
| **Testing** | Vitest + Supertest |

## Requisitos

- **Node.js** 20+
- **pnpm** 9+
- **PostgreSQL** 15+

## Setup rápido

```bash
# 1. Clonar e instalar
git clone <repo>
cd almacenando
pnpm install

# 2. Configurar variables de entorno
cp env.example .env
# Editar .env con tus credenciales (DB, APIs, emails)

# 3. Ejecutar migraciones de base de datos
pnpm --filter @workspace/db run migrate

# 4. Iniciar servidores (2 terminales)
pnpm --filter @workspace/api-server run dev   # API en :3000
pnpm --filter @workspace/legado run dev       # Frontend en :5173
```

## Scripts principales

| Comando | Descripción |
|---------|-------------|
| `pnpm install` | Instalar todas las dependencias del workspace |
| `pnpm run build` | Build producción (typecheck + compilar todos los artifacts) |
| `pnpm run typecheck` | Verificar tipos TypeScript en todo el proyecto |
| `pnpm run migrate` | Ejecutar migraciones de base de datos |
| `pnpm run start` | Iniciar servidor en producción (Render) |
| `pnpm --filter @workspace/api-server run dev` | Servidor API en modo desarrollo |
| `pnpm --filter @workspace/legado run dev` | Frontend en modo desarrollo |
| `pnpm --filter @workspace/api-server run test` | Tests del backend |
| `pnpm --filter @workspace/db run push` | Pushear schema a DB sin migración |
| `pnpm --filter @workspace/db run generate` | Generar migración desde schema |

## Estructura del proyecto

```
almacenando/
├── artifacts/
│   ├── api-server/        → Backend Express (rutas, lib, tests)
│   └── legado/            → Frontend React SPA
├── lib/
│   ├── db/                → Schema Drizzle, migraciones SQL
│   ├── api-zod/           → Schemas Zod compartidos
│   └── api-client-react/  → Cliente HTTP generado (orval)
├── scripts/               → Utilidades y hooks
├── pnpm-workspace.yaml    → Catálogo de versiones compartidas
├── render.yaml            → Config de deploy en Render
└── env.example            → Template de variables de entorno
```

## Arquitectura

```
┌─────────────┐     ┌──────────────┐     ┌────────────┐
│  legado     │────▶│  api-server  │────▶│ PostgreSQL │
│  (React)    │     │  (Express)   │     │  (Drizzle) │
└─────────────┘     └──────┬───────┘     └────────────┘
                           │
                    ┌──────┴───────┐
                    │  Servicios   │
                    │  Externos    │
                    ├──────────────┤
                    │ Google Drive │
                    │ Cloudinary   │
                    │ Resend       │
                    │ OpenAI       │
                    │ Gemini       │
                    └──────────────┘
```

## Despliegue (Render)

El proyecto está configurado para deploy en Render vía `render.yaml`.  
La API sirve tanto los endpoints REST (`/api/*`) como el frontend estático compilado (`/*`).

Variables requeridas en el dashboard de Render:
- `DATABASE_URL` — PostgreSQL connection string
- `SESSION_SECRET` — Clave JWT (mínimo 48 caracteres hex)
- `APP_URL` — URL del servicio
- `SMTP_EMAIL`, `SMTP_APP_PASSWORD` — Credenciales Gmail SMTP
- `NOTIFY_*` — Destinatarios de notificaciones (11 variables)
- `AI_INTEGRATIONS_OPENAI_*` — OpenAI para extracción MSDS
- `GEMINI_API_KEY` — Gemini para compatibilidad química
- `GOOGLE_*` — Google Drive para almacenamiento
- `CLOUDINARY_*` — Cloudinary para fotos (opcional)

Ver `env.example` para la lista completa.
