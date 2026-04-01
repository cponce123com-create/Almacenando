# Prompt de mejora para Replit Agent — Almacenando

Pega este prompt completo en el chat de Replit Agent para aplicar todas las correcciones y mejoras al proyecto.

---

## PROMPT

Eres un experto en TypeScript, Express, Drizzle ORM y React. Necesito que apliques las siguientes correcciones y mejoras al proyecto **Almacenando** (monorepo con pnpm workspaces). Aplica los cambios en el orden listado. No inventes rutas nuevas que no existan. Mantén el estilo de código existente (imports `.js`, `asyncHandler`, `writeAuditLog`, `requireAuth`, `requireRole`).

---

### 1. CRÍTICO — Corregir reset de contraseñas (admin-users.ts)

**Problema:** `POST /api/admin/users/reset-all-passwords` y `POST /api/admin/users/:id/reset-password` generan contraseñas predecibles (`username123`) y las devuelven en texto plano en la respuesta JSON.

**Solución:** Reemplaza AMBOS endpoints de reset de contraseña con el siguiente patrón seguro:

1. Agregar columna a la tabla `users` en el schema de Drizzle (`lib/db/src/schema/users.ts`):
   ```
   passwordResetToken: text("password_reset_token"),
   passwordResetExpiresAt: timestamp("password_reset_expires_at"),
   ```

2. Crear migración SQL para esa columna.

3. El endpoint `POST /api/admin/users/:id/reset-password` debe:
   - Generar un token con `crypto.randomBytes(32).toString('hex')`
   - Hashear el token con `crypto.createHash('sha256').update(token).digest('hex')` antes de guardarlo en DB
   - Guardar el hash en `passwordResetToken` y `passwordResetExpiresAt` = now + 24 horas
   - Enviar el token **sin hashear** al email del usuario usando la función de email existente
   - Responder con `{ message: "Email de reset enviado a " + user.email }` — NUNCA incluir el token ni contraseña en la respuesta
   - Agregar rate limit de 3 intentos/hora por IP

4. Crear nuevo endpoint `POST /api/auth/reset-password` (público, sin requireAuth):
   - Recibe `{ token, newPassword }`
   - Hashea el token recibido y lo compara con el DB
   - Verifica que `passwordResetExpiresAt > now`
   - Actualiza `passwordHash` con bcrypt, limpia `passwordResetToken` y `passwordResetExpiresAt`
   - Responde 200 OK

5. Eliminar el endpoint `POST /api/admin/users/reset-all-passwords` completamente — es demasiado peligroso.

---

### 2. CRÍTICO — Verificar unicidad de email en PUT /api/auth/me (auth.ts)

**Problema:** El endpoint `PUT /api/auth/me` permite cambiar el email a uno ya registrado por otro usuario.

**Solución:** Antes de actualizar, si `parsed.data.email` existe y es diferente al email actual del usuario, ejecutar:
```typescript
const existing = await db.select({ id: usersTable.id })
  .from(usersTable)
  .where(and(eq(usersTable.email, parsed.data.email), ne(usersTable.id, authedReq.userId)))
  .limit(1);
if (existing.length > 0) {
  res.status(409).json({ error: "El correo ya está en uso por otra cuenta" });
  return;
}
```

---

### 3. MEDIO — Agregar permisos granulares por usuario (nueva tabla + endpoints)

Crear el sistema de permisos que controla qué páginas y acciones están disponibles para cada rol.

**En `lib/db/src/schema/` crear `user-permissions.ts`:**
```typescript
export const userPermissionsTable = pgTable("user_permissions", {
  id: text("id").primaryKey(),
  role: warehouseRoleEnum("role").notNull(),
  pageId: text("page_id").notNull(),
  canView: boolean("can_view").notNull().default(true),
  canImport: boolean("can_import").notNull().default(false),
  canExport: boolean("can_export").notNull().default(false),
  canEdit: boolean("can_edit").notNull().default(false),
  canDelete: boolean("can_delete").notNull().default(false),
  updatedBy: text("updated_by").references(() => usersTable.id),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
}, (t) => [
  index("permissions_role_page_idx").on(t.role, t.pageId),
  unique("permissions_role_page_unique").on(t.role, t.pageId),
]);
```

**Crear migración SQL para esta tabla.**

**Crear `artifacts/api-server/src/routes/permissions.ts`** con:
- `GET /api/admin/permissions` — devuelve todos los permisos agrupados por rol (requiere admin)
- `GET /api/admin/permissions/:role` — devuelve permisos de un rol específico (requiere admin/supervisor)
- `PUT /api/admin/permissions/:role` — actualiza permisos de un rol, recibe array de `{ pageId, canView, canImport, canExport, canEdit, canDelete }` (requiere admin). Usar `onConflictDoUpdate` de Drizzle.
- `GET /api/auth/my-permissions` — devuelve los permisos del usuario autenticado según su rol (requiere auth)

Registrar la ruta en `routes/index.ts` como `/api/admin/permissions`.

---

### 4. MEDIO — Mover filtros de reportes a la base de datos (reports.ts)

**Problema:** Los filtros `product`, `personnelId` y fechas de EPP se aplican en JavaScript con `.filter()` después de cargar toda la tabla.

**Solución:** En `routes/reports.ts`:

- En `GET /api/reports/inventory`: mover el filtro `product` a la query Drizzle usando:
  ```typescript
  import { ilike, or } from "drizzle-orm";
  // Agregar al where:
  product ? or(ilike(productsTable.code, `%${product}%`), ilike(productsTable.name, `%${product}%`)) : undefined
  ```

- En `GET /api/reports/epp-deliveries`: mover los filtros `personnelId`, `from` y `to` al query Drizzle con `and()` + `gte()` + `lte()`.

- Eliminar los `.filter()` de JavaScript correspondientes.

---

### 5. MEDIO — Unificar política de contraseñas (auth.ts + admin-users.ts)

**Problema:** `createUserSchema` en `admin-users.ts` requiere mínimo 6 chars, mientras que `updateMeSchema` en `auth.ts` requiere 8 chars + mayúscula + número.

**Solución:** En `lib/api-zod/src/` crear un archivo `password-schema.ts` con:
```typescript
import { z } from "zod/v4";
export const passwordSchema = z.string()
  .min(8, "La contraseña debe tener al menos 8 caracteres")
  .regex(/[A-Z]/, "Debe tener al menos una mayúscula")
  .regex(/[0-9]/, "Debe tener al menos un número");
```

Importar y usar `passwordSchema` en `admin-users.ts` (campo `password` de `createUserSchema` y `updateUserSchema`) y en `auth.ts` (campo `newPassword` de `updateMeSchema`).

---

### 6. MEDIO — Agregar índices en audit_logs y política de retención

**En `lib/db/src/schema/audit-logs.ts`** agregar índices:
```typescript
(t) => [
  index("audit_logs_user_id_idx").on(t.userId),
  index("audit_logs_resource_idx").on(t.resource),
  index("audit_logs_created_at_idx").on(t.createdAt),
]
```

Crear migración SQL correspondiente.

En `artifacts/api-server/src/lib/audit.ts`, al final del archivo agregar limpieza automática (similar al cleanup de tokens):
```typescript
// Borrar audit logs de más de 180 días (retención semestral)
export async function cleanupOldAuditLogs(): Promise<void> {
  try {
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - 180);
    await db.delete(auditLogsTable).where(lt(auditLogsTable.createdAt, cutoff));
  } catch { /* non-critical */ }
}
setInterval(() => void cleanupOldAuditLogs(), 24 * 60 * 60 * 1000).unref();
```

---

### 7. MEDIO — Hacer revokeToken crítico en logout (auth.ts + auth route)

**Problema:** Si `revokeToken` falla silenciosamente, el usuario recibe 200 OK pero el token no se invalida.

**Solución:** En `lib/auth.ts`, modificar `revokeToken` para que propague el error en lugar de capturarlo:
```typescript
export async function revokeToken(jti: string, expiresAt: Date): Promise<void> {
  await db.insert(revokedTokensTable).values({ jti, expiresAt }).onConflictDoNothing();
}
```

En `routes/auth.ts`, el endpoint `POST /api/auth/logout` ya usa `asyncHandler`, por lo que el error se propagará automáticamente al error handler global con 500.

---

### 8. MEJORA — Agregar requireRole en rutas de exportación de reportes

**En `routes/reports.ts`**, importar `requireRole` desde `../lib/auth.js` y agregar `requireRole("admin", "supervisor", "quality")` como middleware en:
- `GET /api/reports/export/:type`
- `GET /api/reports/epp-alerts`

Los demás endpoints de reportes pueden quedar con solo `requireAuth`.

---

### 9. MEJORA — Validación de MIME type real en uploads (inventory.ts + otros)

**Instalar la dependencia:**
```bash
pnpm add file-type --filter @workspace/api-server
```

En `routes/inventory.ts`, agregar validación de magic bytes después de recibir el archivo:
```typescript
import { fileTypeFromBuffer } from "file-type";

// Dentro de la ruta que recibe archivos, antes de procesar:
const detectedType = await fileTypeFromBuffer(file.buffer);
const allowedTypes = ["image/jpeg", "image/png", "image/webp", "image/gif"];
if (!detectedType || !allowedTypes.includes(detectedType.mime)) {
  res.status(400).json({ error: "Tipo de archivo no permitido" });
  return;
}
```

---

### 10. MEJORA — Corregir duplicado de migración 0005

Hay dos archivos con número de migración 0005:
- `0005_fixes_and_revoked_tokens.sql`
- `0005_revoked_tokens.sql`

**Renombrar** `0005_fixes_and_revoked_tokens.sql` a `0006_fixes.sql` (o al siguiente número disponible después de `0006_inventory_boxes_and_inventory_location.sql`) y actualizar `lib/db/drizzle/meta/_journal.json` con la entrada correcta.

---

### 11. MEJORA — Agregar endpoint GET /api/admin/users/:id/audit-log

En `routes/admin-users.ts`, agregar:
```typescript
router.get("/:id/audit-log", requireAuth, requireRole("admin", "supervisor"), asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { page, limit, offset } = parsePagination(req.query);
  const logs = await db.select()
    .from(auditLogsTable)
    .where(eq(auditLogsTable.userId, id as string))
    .orderBy(desc(auditLogsTable.createdAt))
    .limit(limit)
    .offset(offset);
  const [total] = await db.select({ count: count() }).from(auditLogsTable).where(eq(auditLogsTable.userId, id as string));
  res.json({ data: logs, pagination: { page, limit, total: total?.count ?? 0 } });
}));
```

Importar `{ auditLogsTable }` desde `@workspace/db`, `{ desc, count }` desde `drizzle-orm`, y `{ parsePagination }` desde `../lib/pagination.js`.

---

### 12. FINAL — Verificar que todo compila y tests pasan

Después de todos los cambios:
```bash
cd artifacts/api-server && pnpm tsc --noEmit
pnpm test
```

Si hay errores de TypeScript, corrígelos antes de terminar. No dejes `@ts-ignore` ni `as any` nuevos sin justificación.

---

**Prioridad de implementación:** 1 → 2 → 7 → 3 → 4 → 5 → 6 → 8 → 9 → 10 → 11 → 12
