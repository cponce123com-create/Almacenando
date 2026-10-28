import type { NextFunction, Request, Response } from "express";
import { db, userPermissionsTable } from "@workspace/db";
import { and, eq } from "drizzle-orm";
import { requireAuth, type AuthenticatedRequest } from "./auth.js";

export const MODULE_PAGE_IDS = [
  "dashboard", "products", "inventory", "balances", "availability", "cuadre",
  "immobilized", "samples", "dye_lots", "lot_evals", "disposition", "epp",
  "personnel", "documents", "supplies", "surplus", "reports", "notifications",
  "admin_users", "msds", "compatibility", "lot_change_notification",
  "product_out_notification", "email_notifications", "locations", "rounds",
  "inventory_progress", "scanner", "picking", "warehouse_map",
] as const;

type PageId = typeof MODULE_PAGE_IDS[number];
type PermissionAction = "canView" | "canImport" | "canExport" | "canEdit" | "canDelete";
const routeModules: Array<[string, PageId]> = [
  ["/balances/now/products", "products"], ["/balances/now", "balances"],
  ["/inventory-cycles", "inventory_progress"], ["/inventory", "inventory"],
  ["/products", "products"], ["/balances", "balances"], ["/availability", "availability"],
  ["/cuadre", "cuadre"], ["/immobilized", "immobilized"], ["/samples", "samples"],
  ["/dye-lots", "dye_lots"], ["/lot-evaluations", "lot_evals"], ["/disposition", "disposition"],
  ["/documents", "documents"], ["/epp", "epp"], ["/personnel", "personnel"],
  ["/reports", "reports"], ["/admin/users", "admin_users"],
  ["/notifications/lot-change", "lot_change_notification"],
  ["/notifications/product-out", "product_out_notification"],
  ["/notifications/stock-colorante", "email_notifications"],
  ["/notifications/stock-auxiliar", "email_notifications"],
  ["/notifications/order-approval", "email_notifications"],
  ["/notifications/plastic-bag", "email_notifications"],
  ["/notifications", "notifications"],
  ["/supplies", "supplies"], ["/surplus", "surplus"], ["/msds", "msds"],
  ["/compatibility", "compatibility"], ["/locations", "locations"], ["/barcode", "scanner"],
  ["/picking", "picking"], ["/reorganization", "warehouse_map"], ["/rounds", "rounds"],
  ["/analytics", "dashboard"],
];

function permissionForRequest(req: Request): PermissionAction {
  const path = req.path.toLowerCase();
  // Export endpoints may use POST when they accept filters or selected IDs.
  // Check destructive/import actions first so those routes keep their own grant.
  if (req.method === "DELETE" || /(?:reset|archive|purge)/.test(path)) return "canDelete";
  if (req.method === "POST" && /(?:import|upload)/.test(path)) return "canImport";
  if (/(?:export|download|template)/.test(path)) return "canExport";
  if (["POST", "PUT", "PATCH"].includes(req.method)) return "canEdit";
  return "canView";
}

/** Enforces the configured role/module matrix for every API route. */
export function checkModulePermission(req: Request, res: Response, next: NextFunction): void {
  const route = routeModules.find(([prefix]) => req.path === prefix || req.path.startsWith(`${prefix}/`));
  if (!route) { next(); return; }

  // NOW connector calls authenticate with their own dedicated shared secret.
  if (req.header("x-datatex-token") && (
    req.path.startsWith("/balances/now/connector/") ||
    req.path.startsWith("/balances/now/products/") ||
    req.path.startsWith("/availability/connector/")
  )) { next(); return; }

  requireAuth(req, res, () => {
    void (async () => {
      const authed = req as AuthenticatedRequest;
      if (authed.userRole === "admin") { next(); return; }
      const [permission] = await db.select().from(userPermissionsTable).where(and(
        eq(userPermissionsTable.role, authed.userRole),
        eq(userPermissionsTable.pageId, route[1]),
      )).limit(1);
      const action = permissionForRequest(req);
      if (!permission?.canView || !permission[action]) {
        res.status(403).json({ error: "No tienes permiso para realizar esta acción en este módulo.", pageId: route[1], action });
        return;
      }
      next();
    })().catch(next);
  });
}
