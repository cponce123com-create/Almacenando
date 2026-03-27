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

## Multi-Warehouse Support

Warehouses: `QA`, `Q1`, `QP`, `QL`, `QD`. A global warehouse selector in the header (persisted to localStorage) filters all data. Products have a composite unique constraint on `(warehouse, code)`.

## Database Schema

Tables: `users`, `products`, `inventory_records`, `immobilized_products`, `samples`, `dye_lots`, `final_disposition`, `documents`, `personnel`, `epp_master`, `epp_deliveries`, `epp_checklists`, `audit_logs`, `lot_evaluations`, `balance_records`, `cuadre_records`, `cuadre_items`

### New product fields (migration 0002)
- `warehouse` — which warehouse the product belongs to
- `type` — product type classification
- `msds` — boolean, whether MSDS sheet is available
- `controlled` — boolean, whether product is controlled/regulated

## Modules (15 total)

1. **Dashboard** — Overview, quick stats, module grid
2. **Maestro de Productos** — Chemical product catalog; new fields: warehouse, type, msds, controlled
3. **Saldo Actualizado** — Balance records per warehouse/date with Excel import/export (new)
4. **Inventarios** — Daily inventory balance records (input/output tracking)
5. **Cuadre** — Admin reconciliation module: physical count vs system balance with items (new)
6. **Productos Inmovilizados** — Products blocked from use with reason and release workflow
7. **Muestras** — Sample tracking for lab analysis
8. **Lotes / Tinturas** — Lot/batch management with quality approval
9. **Control de Lotes** — Lab lot evaluation module
10. **Disposición Final** — Waste disposal records with contractor and manifests
11. **Documentos** — Safety documents and certificates
12. **EPP** — Personal protective equipment catalog, deliveries, and checklists
13. **Personal** — Personnel directory
14. **Reportes** — Summary reports and stats
15. **Administración** — User management (admin only)

## API Routes

All routes under `/api/`:

- Auth: `POST /auth/login`, `POST /auth/logout`, `GET /auth/me`
- Products: `/products` (CRUD + `?warehouse=` filter, Excel template/import/export)
- Inventory: `/inventory` (CRUD + `?warehouse=` filter)
- Balances: `/balances` (CRUD + dates, latest, Excel template/import)
- Cuadre: `/cuadre` (CRUD + detail with items)
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
