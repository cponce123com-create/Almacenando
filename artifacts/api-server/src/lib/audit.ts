import { db } from "@workspace/db";
import { auditLogsTable } from "@workspace/db";
import { generateId } from "./id.js";

export type AuditAction =
  | "legacy_released_auto"
  | "legacy_released_admin"
  | "legacy_rejected_admin"
  | "death_report_submitted"
  | "death_report_confirmed"
  | "recipient_accessed_portal"
  | "trusted_contact_added";

export async function writeAuditLog({
  action,
  userId,
  actorId,
  actorType,
  metadata,
}: {
  action: AuditAction;
  userId?: string;
  actorId?: string;
  actorType?: "admin" | "trusted_contact" | "recipient" | "system";
  metadata?: Record<string, unknown>;
}): Promise<void> {
  try {
    await db.insert(auditLogsTable).values({
      id: generateId(),
      action,
      userId: userId ?? null,
      actorId: actorId ?? null,
      actorType: actorType ?? null,
      metadata: metadata ? JSON.stringify(metadata) : null,
    });
  } catch (err) {
    console.error("[audit] Failed to write audit log:", err);
  }
}
