import { Router } from "express";
import { db } from "@workspace/db";
import { userPermissionsTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { requireAuth, requireRole, type AuthenticatedRequest } from "../lib/auth.js";
import { generateId } from "../lib/id.js";
import { z } from "zod/v4";
import { asyncHandler } from "../lib/async-handler.js";
import type { WarehouseRole } from "@workspace/db";
import { MODULE_PAGE_IDS } from "../lib/checkPermission.js";

/**
 * Admin — Permisos
 * Admin: permisos de usuarios
 */

const router = Router();

const actionSchema = z.enum(["import", "export", "delete", "edit"]);
const permissionUpdateSchema = z.object({
  pages: z.array(z.enum(MODULE_PAGE_IDS)).max(MODULE_PAGE_IDS.length),
  actions: z.array(actionSchema).max(4),
});
const roleSchema = z.enum(["admin", "supervisor", "operator", "quality", "readonly"]);

// ---------------------------------------------------------------------------
// IMPORTANT: /my-permissions MUST be declared BEFORE /:role.
// Express matches routes in order — if /:role comes first, a request to
// /my-permissions would be captured with role = "my-permissions" instead
// of hitting this dedicated handler.
// ---------------------------------------------------------------------------
router.get("/my-permissions", requireAuth, asyncHandler(async (req, res) => {
  const authedReq = req as AuthenticatedRequest;
  const perms = await db.select().from(userPermissionsTable)
    .where(eq(userPermissionsTable.role, authedReq.userRole));
  res.json(perms);
}));

router.get("/", requireAuth, requireRole("admin"), asyncHandler(async (_req, res) => {
  const perms = await db.select().from(userPermissionsTable);
  res.json(perms);
}));

router.get("/:role", requireAuth, requireRole("admin", "supervisor"), asyncHandler(async (req, res) => {
  const { role } = req.params;
  const perms = await db.select().from(userPermissionsTable)
    .where(eq(userPermissionsTable.role, role as WarehouseRole));
  res.json(perms);
}));

router.put("/:role", requireAuth, requireRole("admin"), asyncHandler(async (req, res) => {
  const authedReq = req as AuthenticatedRequest;
  const { role } = req.params;
  const validRole = roleSchema.safeParse(role);
  const parsed = permissionUpdateSchema.safeParse(req.body);
  if (!parsed.success || !validRole.success) {
    res.status(400).json({ error: "Datos inválidos" });
    return;
  }

  const now = new Date();
  const actions = new Set(parsed.data.actions);
  const pages = new Set(parsed.data.pages);
  const values = MODULE_PAGE_IDS.map((pageId) => ({
    id: generateId(),
    role: role as WarehouseRole,
    pageId,
    canView: pages.has(pageId),
    canImport: pages.has(pageId) && actions.has("import"),
    canExport: pages.has(pageId) && actions.has("export"),
    canEdit: pages.has(pageId) && actions.has("edit"),
    canDelete: pages.has(pageId) && actions.has("delete"),
    updatedBy: authedReq.userId,
    updatedAt: now,
  }));

  await db.transaction(async (tx) => {
    for (const v of values) {
      await tx.insert(userPermissionsTable).values(v).onConflictDoUpdate({
        target: [userPermissionsTable.role, userPermissionsTable.pageId],
        set: { canView: v.canView, canImport: v.canImport, canExport: v.canExport,
          canEdit: v.canEdit, canDelete: v.canDelete, updatedBy: v.updatedBy, updatedAt: v.updatedAt },
      });
    }
  });

  const updated = await db.select().from(userPermissionsTable)
    .where(eq(userPermissionsTable.role, role as WarehouseRole));
  res.json(updated);
}));

export default router;
