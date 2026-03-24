import { db } from "@workspace/db";
import { auditLogsTable } from "@workspace/db";
import { generateId } from "./id.js";
import { logger } from "./logger.js";

export type AuditAction =
  | "create"
  | "update"
  | "delete"
  | "release"
  | "approve"
  | "reject"
  | "login"
  | "logout"
  | "view";

export async function writeAuditLog({
  userId,
  action,
  resource,
  resourceId,
  details,
  ipAddress,
}: {
  userId?: string;
  action: AuditAction;
  resource: string;
  resourceId?: string;
  details?: Record<string, unknown>;
  ipAddress?: string;
}): Promise<void> {
  try {
    await db.insert(auditLogsTable).values({
      id: generateId(),
      userId: userId ?? null,
      action,
      resource,
      resourceId: resourceId ?? null,
      details: details ?? null,
      ipAddress: ipAddress ?? null,
    });
  } catch (err) {
    // Usamos logger en lugar de console.error para que el error
    // aparezca correctamente en los logs estructurados de Render/Pino.
    logger.error({ err }, "[audit] Failed to write audit log");
  }
}
