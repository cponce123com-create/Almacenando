import { db } from "@workspace/db";
import { auditLogsTable } from "@workspace/db";
import { generateId } from "./id.js";
import { logger } from "./logger.js";
import { lt } from "drizzle-orm";

export type AuditAction =
  | "create"
  | "update"
  | "delete"
  | "release"
  | "approve"
  | "reject"
  | "login"
  | "logout"
  | "view"
  | "lot_change_notification"
  | "product_out_notification"
  | "email_notification";

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
    logger.error({ err }, "[audit] Failed to write audit log");
  }
}

export async function cleanupOldAuditLogs(): Promise<void> {
  try {
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - 180);
    await db.delete(auditLogsTable).where(lt(auditLogsTable.createdAt, cutoff));
  } catch { /* non-critical */ }
}

setInterval(() => void cleanupOldAuditLogs(), 24 * 60 * 60 * 1000).unref();
