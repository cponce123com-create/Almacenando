import { db } from "@workspace/db";
import { auditLogsTable } from "@workspace/db";
import { generateId } from "./id.js";

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
    console.error("[audit] Failed to write audit log:", err);
  }
}
