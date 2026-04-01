import { Router } from "express";
import { db } from "@workspace/db";
import { userPermissionsTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { requireAuth, requireRole, type AuthenticatedRequest } from "../lib/auth.js";
import { generateId } from "../lib/id.js";
import { z } from "zod/v4";
import { asyncHandler } from "../lib/async-handler.js";
import type { WarehouseRole } from "@workspace/db";

const router = Router();

const permissionUpdateSchema = z.array(z.object({
  pageId: z.string().min(1),
  canView: z.boolean().default(true),
  canImport: z.boolean().default(false),
  canExport: z.boolean().default(false),
  canEdit: z.boolean().default(false),
  canDelete: z.boolean().default(false),
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
  const parsed = permissionUpdateSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Datos inválidos" });
    return;
  }

  const now = new Date();
  const values = parsed.data.map((p) => ({
    id: generateId(),
    role: role as WarehouseRole,
    pageId: p.pageId,
    canView: p.canView,
    canImport: p.canImport,
    canExport: p.canExport,
    canEdit: p.canEdit,
    canDelete: p.canDelete,
    updatedBy: authedReq.userId,
    updatedAt: now,
  }));

  for (const v of values) {
    await db.insert(userPermissionsTable).values(v)
      .onConflictDoUpdate({
        target: [userPermissionsTable.role, userPermissionsTable.pageId],
        set: {
          canView: v.canView,
          canImport: v.canImport,
          canExport: v.canExport,
          canEdit: v.canEdit,
          canDelete: v.canDelete,
          updatedBy: v.updatedBy,
          updatedAt: v.updatedAt,
        },
      });
  }

  const updated = await db.select().from(userPermissionsTable)
    .where(eq(userPermissionsTable.role, role as WarehouseRole));
  res.json(updated);
}));

router.get("/my-permissions", requireAuth, asyncHandler(async (req, res) => {
  const authedReq = req as AuthenticatedRequest;
  const perms = await db.select().from(userPermissionsTable)
    .where(eq(userPermissionsTable.role, authedReq.userRole));
  res.json(perms);
}));

export default router;
