# Workspace — Legado

## Overview

Legado is a digital legacy platform (MVP) where users can create and store messages, videos, letters, photos, and documents for their loved ones, which are only delivered after their confirmed passing. Built as a full-stack pnpm monorepo.

## Stack

- **Monorepo tool**: pnpm workspaces
- **Node.js version**: 24
- **Package manager**: pnpm
- **TypeScript version**: 5.9
- **API framework**: Express 5
- **Frontend**: React + Vite (wouter router, TanStack Query, Tailwind CSS, shadcn/ui, framer-motion)
- **Database**: PostgreSQL + Drizzle ORM (Replit built-in DB or Neon — auto-detects via DATABASE_URL)
- **File Storage**: Cloudinary (images, videos, audio, PDFs) — env vars: `CLOUDINARY_CLOUD_NAME`, `CLOUDINARY_API_KEY`, `CLOUDINARY_API_SECRET`
- **Auth**: JWT (jsonwebtoken + bcryptjs) — stored in localStorage
- **Validation**: Zod, drizzle-zod
- **API codegen**: Orval (from OpenAPI spec)
- **Build**: esbuild (CJS bundle for API server)

## Structure

```text
artifacts-monorepo/
├── artifacts/
│   ├── api-server/         # Express API server (all backend logic)
│   └── legado/             # React + Vite frontend (Legado app)
├── lib/                    # Shared libraries
│   ├── api-spec/           # OpenAPI spec + Orval codegen config
│   ├── api-client-react/   # Generated React Query hooks
│   ├── api-zod/            # Generated Zod schemas from OpenAPI
│   └── db/                 # Drizzle ORM schema + DB connection
├── scripts/                # Utility scripts
├── pnpm-workspace.yaml
├── tsconfig.base.json
├── tsconfig.json
└── package.json
```

## Key Features (MVP)

1. **Auth** — Register/login with email+password, JWT sessions
2. **Legacy Items** — Create/edit/delete items (video, letter, audio, photo, document, funeral_note)
3. **Recipients** — Manage people who will receive the legacy
4. **Trusted Contacts** — Contacts who can report/confirm death
5. **Funeral Preferences** — Store burial/ceremony preferences
6. **Activation Settings** — Configure minimum confirmations for death report
7. **Death Report Flow** — Trusted contacts report → confirm → admin review → release
8. **Recipient Portal** — Token-based access at `/access/:token`
9. **Admin Panel** — `/admin` (login via `/admin/login`), review and approve/reject death reports
10. **Dashboard** — Shows completion percentage and progress steps

## Database Schema

Tables: `users`, `profiles`, `recipients`, `trusted_contacts`, `legacy_items`, `legacy_item_recipients`, `funeral_preferences`, `activation_settings`, `death_reports`, `death_confirmations`, `release_events`, `recipient_access_tokens`, `admins`

## API Routes

All routes under `/api/`:

- Auth: `/auth/register`, `/auth/login`, `/auth/logout`, `/auth/me`
- Profile: `/profile`
- Legacy: `/legacy-items`, `/legacy-items/:id`, `/legacy-items/:id/recipients`
- Recipients: `/recipients`, `/recipients/:id`
- Trusted Contacts: `/trusted-contacts`, `/trusted-contacts/:id`
- Funeral: `/funeral-preferences`
- Activation: `/activation-settings`
- Death Reports: `/death-reports`, `/death-reports/:id/confirm`
- Access Portal: `/access/:token`
- Dashboard: `/dashboard/stats`
- Admin: `/admin/login`, `/admin/death-reports`, `/admin/death-reports/:id`, `/admin/death-reports/:id/approve`, `/admin/death-reports/:id/reject`
- Upload: `POST /upload` (multipart/form-data, field "file", max 200 MB) → returns `{ url, publicId, resourceType, format, bytes }`

## Admin Setup

To create an admin account, POST to `/api/admin/setup` with:
```json
{
  "email": "admin@legado.com",
  "password": "your-password",
  "name": "Admin",
  "setupKey": "legado-admin-setup"
}
```
The setup key can be overridden with the `ADMIN_SETUP_KEY` env variable.

## TypeScript & Composite Projects

Every package extends `tsconfig.base.json`. Root `tsconfig.json` lists lib packages as project references. Run full typecheck with `pnpm run typecheck`.

## Development Commands

- `pnpm --filter @workspace/api-server run dev` — API server
- `pnpm --filter @workspace/legado run dev` — Frontend dev server
- `pnpm --filter @workspace/db run push` — Push DB schema
- `pnpm --filter @workspace/api-spec run codegen` — Regenerate API client
