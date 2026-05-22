# Changelog

## 2026-05-22

### Auditoría completa — Fases 0 a 3 (commit `55cccfa`)

#### Seguridad
- 🔒 `env.example`: Credenciales reales reemplazadas por placeholders
- 🔒 `email-recipients.ts`: 21 emails corporativos eliminados del código,
  movidos a variables de entorno (`NOTIFY_*`, `SMTP_EMAIL`)
- 🔒 `compatibility.ts`: Gemini API key movida de query param a header
- 🔒 `rate-limit.ts`: Todos los rate limiters condicionados a producción
- 🔒 `app.ts`: CSP configurado via Helmet

#### Calidad de código
- ♻️ `email.ts`, `notifications.ts`: `console.warn`/`console.error` → `logger`
- ♻️ `seed.ts`: Seed protegido contra ejecución en producción
- ♻️ `tsconfig.base.json`: `strictFunctionTypes` y `noImplicitOverride` activados
- 🐛 15 errores TypeScript pre-existentes corregidos (`auth.ts`, `seed.ts`, `admin-users.ts`, etc.)

#### Rendimiento
- ⚡ `inventory.ts`: Endpoint `/stats` optimizado — 1 SQL con CTE vs N iteraciones en JS
- ⚡ `compatibility.ts`: Cache en memoria para Gemini (TTL 24h)
- ⚡ `inventory.ts`: Queries de listado paralelizadas con `Promise.all`

#### Infraestructura
- 🗑️ 74 archivos de legado Replit eliminados (mockup-sandbox, plugins, doc)
- 📦 `xlsx` unificado en catálogo pnpm

### Correcciones post-auditoría (commit `55cccfa`)

- ✨ `compression` middleware agregado a Express (gzip/brotli)
- ♻️ Catch blocks vacíos → `logger.warn` en `inventory.ts`, `audit.ts`
- ♻️ Casts `as any` reemplazados por tipado explícito en `msds.ts`, `compatibility.ts`
- ♻️ Helper `excel-parser.ts` creado; refactorizadas 4 rutas (`products.ts`, `balances.ts`,
  `lot-evaluations.ts`, `epp.ts`) — eliminado código duplicado de parseo Excel
- 📝 `env.example`: Agregadas `GOOGLE_DRIVE_PHOTOS_FOLDER_ID`, `GOOGLE_DRIVE_MSDS_FOLDER_ID`
- 🔧 Script `pnpm run format` agregado (prettier)
