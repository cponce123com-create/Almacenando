# Workspace — Almacén Químico

## Overview

Chemical warehouse management system (Sistema de Almacén de Productos Químicos). Built as a full-stack pnpm monorepo with role-based access control for managing chemical products, inventory, safety compliance, and personnel.

## Stack

- **Monorepo tool**: pnpm workspaces
- **Node.js version**: 24
- **Package manager**: pnpm
- **TypeScript version**: 5.9
- **API framework**: Express 5
- **Frontend**: React + Vite (wouter router, TanStack Query, Tailwind CSS, shadcn/ui, framer-motion)
- **Database**: PostgreSQL + Drizzle ORM (Replit built-in DB — auto-detects via DATABASE_URL)
- **Auth**: JWT (jsonwebtoken + bcryptjs) with role-based access control
- **Validation**: Zod, drizzle-zod

## Structure

```text
artifacts-monorepo/
├── artifacts/
│   ├── api-server/         # Express API server (all backend logic)
│   └── legado/             # React + Vite frontend (Warehouse app)
├── lib/                    # Shared libraries
│   ├── api-spec/           # OpenAPI spec + Orval codegen config
│   ├── api-client-react/   # Generated React Query hooks (legacy, may be updated)
│   ├── api-zod/            # Generated Zod schemas from OpenAPI
│   └── db/                 # Drizzle ORM schema + DB connection
├── scripts/                # Utility scripts
├── pnpm-workspace.yaml
├── tsconfig.base.json
├── tsconfig.json
└── package.json
```

## User Roles

- **admin** — Full system access, user management
- **supervisor** — Can approve/release immobilized products, manage all records
- **operator** — Create and edit inventory records, products
- **quality** — Manage samples, dye lots, quality approvals
- **readonly** — View-only access to all modules

## Demo Credentials

All use password: `Almacen2024!`

| Role | Email |
|------|-------|
| admin | admin@almacen.com |
| supervisor | supervisor@almacen.com |
| operator | operario@almacen.com |
| quality | calidad@almacen.com |
| readonly | consulta@almacen.com |

## Database Schema

Tables: `users`, `products`, `inventory_records`, `immobilized_products`, `samples`, `dye_lots`, `final_disposition`, `documents`, `personnel`, `epp_master`, `epp_deliveries`, `epp_checklists`, `audit_logs`

## Modules (12 total)

1. **Dashboard** — Overview, quick stats, module grid
2. **Maestro de Productos** — Chemical product catalog (code, CAS, category, location, storage)
3. **Cuadre de Inventario** — Daily inventory balance records (input/output tracking)
4. **Productos Inmovilizados** — Products blocked from use with reason and release workflow
5. **Muestras** — Sample tracking for lab analysis
6. **Lotes / Tinturas** — Lot/batch management with quality approval
7. **Disposición Final** — Waste disposal records with contractor and manifests
8. **Documentos** — Safety documents and certificates
9. **EPP** — Personal protective equipment catalog, deliveries, and checklists
10. **Personal** — Personnel directory
11. **Reportes** — Summary reports and stats
12. **Administración** — User management (admin only)

## API Routes

All routes under `/api/`:

- Auth: `POST /auth/login`, `POST /auth/logout`, `GET /auth/me`
- Products: `/products` (CRUD)
- Inventory: `/inventory` (CRUD)
- Immobilized: `/immobilized` (CRUD + release workflow)
- Samples: `/samples` (CRUD)
- Dye lots: `/dye-lots` (CRUD + quality approval)
- Disposition: `/disposition` (CRUD)
- Documents: `/documents` (CRUD)
- EPP: `/epp` (catalog), `/epp/deliveries`, `/epp/checklists`
- Personnel: `/personnel` (CRUD)
- Reports: `/reports/summary`, `/reports/inventory`
- Admin: `/admin/users` (CRUD, admin only)
- Health: `GET /healthz`

## Auth & Authorization

JWT tokens signed with SESSION_SECRET env var. Role middleware via `requireRole(...roles)`. Token stored in sessionStorage as `almacen_token`.

## Development Commands

- `pnpm --filter @workspace/api-server run dev` — API server
- `pnpm --filter @workspace/legado run dev` — Frontend dev server
- `pnpm --filter @workspace/db run push` — Push DB schema

## TypeScript & Composite Projects

Every package extends `tsconfig.base.json`. Root `tsconfig.json` lists lib packages as project references. Run full typecheck with `pnpm run typecheck`.
