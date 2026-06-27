import type { Request, Response, NextFunction } from "express";
import { db, userPermissionsTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import type { WarehouseRole } from "@workspace/db";
import type { AuthenticatedRequest } from "./auth.js";

// Cache en memoria: key = `${role}:${pageId}`, value = permission row, TTL = 30s
const permissionCache = new Map<string, { data: Record<string, boolean>; expiresAt: number }>();
const CACHE_TTL = 30_000; // 30 segundos

function getCachedPermission(role: string, pageId: string): Record<string, boolean> | null {
  const key = `${role}:${pageId}`;
  const cached = permissionCache.get(key);
  if (cached && cached.expiresAt > Date.now()) return cached.data;
  permissionCache.delete(key);
  return null;
}

function setCachedPermission(role: string, pageId: string, data: Record<string, boolean>): void {
  const key = `${role}:${pageId}`;
  permissionCache.set(key, { data, expiresAt: Date.now() + CACHE_TTL });
}

/**
 * Middleware que verifica si el rol del usuario autenticado tiene un permiso
 * específico sobre una página/módulo.
 *
 * @param pageId - Identificador de la página (ej: "products", "inventory")
 * @param action - Acción requerida: "canEdit", "canDelete", "canImport", "canExport"
 */
export function checkPermission(pageId: string, action: "canEdit" | "canDelete" | "canImport" | "canExport") {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const authedReq = req as AuthenticatedRequest;
      if (!authedReq.userId) {
        res.status(401).json({ error: "No autorizado" });
        return;
      }

      // Admin tiene acceso total — saltear verificación
      if (authedReq.userRole === "admin") {
        next();
        return;
      }

      // Buscar en caché o en DB
      let perms = getCachedPermission(authedReq.userRole, pageId);
      if (!perms) {
        const rows = await db
          .select({
            canEdit: userPermissionsTable.canEdit,
            canDelete: userPermissionsTable.canDelete,
            canImport: userPermissionsTable.canImport,
            canExport: userPermissionsTable.canExport,
          })
          .from(userPermissionsTable)
          .where(eq(userPermissionsTable.role, authedReq.userRole as WarehouseRole))
          .limit(1);

        if (rows.length === 0) {
          // Sin permisos configurados para este rol — denegar
          res.status(403).json({ error: "Acceso denegado: permisos no configurados para este rol" });
          return;
        }

        perms = rows[0]!;
        setCachedPermission(authedReq.userRole, pageId, perms);
      }

      if (!perms[action]) {
        res.status(403).json({ error: `Acceso denegado: no tienes permiso para ${action} en ${pageId}` });
        return;
      }

      next();
    } catch (err) {
      next(err);
    }
  };
}
