import { Router } from "express";
import { db } from "@workspace/db";
import {
  trustedContactsTable,
  profilesTable,
  deathReportsTable,
  deathConfirmationsTable,
  activationSettingsTable,
  releaseEventsTable,
  recipientAccessTokensTable,
  recipientsTable,
  legacyItemsTable,
  legacyItemRecipientsTable,
} from "@workspace/db";
import { eq, and, inArray } from "drizzle-orm";
import { generateId } from "../lib/id.js";
import { randomBytes } from "crypto";
import { sendAccessLinkEmail } from "../lib/email.js";
import { writeAuditLog } from "../lib/audit.js";

const router = Router();

function getAppUrl(): string {
  if (process.env.APP_URL) return process.env.APP_URL.replace(/\/$/, "");
  if (process.env.REPLIT_DOMAINS) return `https://${process.env.REPLIT_DOMAINS.split(",")[0]}`;
  return "https://legadoapp.replit.app";
}

// GET /api/activation/trusted-contact-info/:token
// Public — returns the owner's name and any pending death report for this contact's user.
// Used by the confirm-contact page to identify who the contact belongs to.
router.get("/trusted-contact-info/:token", async (req, res) => {
  const { token } = req.params;

  const contacts = await db
    .select()
    .from(trustedContactsTable)
    .where(eq(trustedContactsTable.confirmToken, token))
    .limit(1);

  if (contacts.length === 0) {
    res.status(404).json({ error: "Token inválido o expirado" });
    return;
  }

  const contact = contacts[0]!;

  const profiles = await db
    .select({ fullName: profilesTable.fullName })
    .from(profilesTable)
    .where(eq(profilesTable.userId, contact.userId))
    .limit(1);

  const pendingReports = await db
    .select({ id: deathReportsTable.id, status: deathReportsTable.status })
    .from(deathReportsTable)
    .where(and(eq(deathReportsTable.userId, contact.userId), eq(deathReportsTable.status, "pending")))
    .limit(1);

  res.json({
    contactId: contact.id,
    contactName: contact.fullName,
    ownerName: profiles[0]?.fullName ?? "el usuario",
    userId: contact.userId,
    pendingReportId: pendingReports[0]?.id ?? null,
  });
});

// POST /api/activation/death-reports
// Public — creates a new death report using the trusted contact's invite token.
router.post("/death-reports", async (req, res) => {
  const { inviteToken, notes } = req.body;

  if (!inviteToken) {
    res.status(400).json({ error: "inviteToken es requerido" });
    return;
  }

  const contacts = await db
    .select()
    .from(trustedContactsTable)
    .where(eq(trustedContactsTable.confirmToken, inviteToken))
    .limit(1);

  if (contacts.length === 0) {
    res.status(403).json({ error: "Token inválido" });
    return;
  }

  const contact = contacts[0]!;

  const existingReports = await db
    .select()
    .from(deathReportsTable)
    .where(and(eq(deathReportsTable.userId, contact.userId), eq(deathReportsTable.status, "pending")))
    .limit(1);

  if (existingReports.length > 0) {
    res.status(409).json({
      error: "Ya existe un reporte pendiente para este usuario.",
      reportId: existingReports[0]!.id,
    });
    return;
  }

  const reportId = generateId();
  await db.insert(deathReportsTable).values({
    id: reportId,
    userId: contact.userId,
    reportedByContactId: contact.id,
    notes: notes?.trim() || null,
    status: "pending",
  });

  writeAuditLog({
    action: "death_report_submitted",
    userId: contact.userId,
    actorId: contact.id,
    actorType: "trusted_contact",
    metadata: { reportId, via: "invite_token" },
  }).catch(() => {});

  res.status(201).json({ success: true, reportId });
});

// POST /api/activation/death-reports/:id/confirm
// Public — confirms an existing death report using the trusted contact's invite token.
// Triggers auto-release if all contacts have confirmed.
router.post("/death-reports/:id/confirm", async (req, res) => {
  const { id: reportId } = req.params;
  const { inviteToken, comments } = req.body;

  if (!inviteToken) {
    res.status(400).json({ error: "inviteToken es requerido" });
    return;
  }

  const reports = await db
    .select()
    .from(deathReportsTable)
    .where(eq(deathReportsTable.id, reportId))
    .limit(1);

  if (reports.length === 0) {
    res.status(404).json({ error: "Reporte no encontrado" });
    return;
  }

  const report = reports[0]!;

  if (report.status !== "pending") {
    res.status(409).json({ error: "Este reporte ya fue procesado" });
    return;
  }

  const contacts = await db
    .select()
    .from(trustedContactsTable)
    .where(
      and(
        eq(trustedContactsTable.confirmToken, inviteToken),
        eq(trustedContactsTable.userId, report.userId)
      )
    )
    .limit(1);

  if (contacts.length === 0) {
    res.status(403).json({ error: "Token inválido para este reporte" });
    return;
  }

  const contact = contacts[0]!;

  if (contact.id === report.reportedByContactId) {
    res.status(400).json({ error: "Ya eres quien inició este reporte. Debe confirmarlo otro contacto." });
    return;
  }

  const existing = await db
    .select()
    .from(deathConfirmationsTable)
    .where(
      and(
        eq(deathConfirmationsTable.deathReportId, reportId),
        eq(deathConfirmationsTable.trustedContactId, contact.id)
      )
    )
    .limit(1);

  if (existing.length > 0) {
    res.status(409).json({ error: "Ya confirmaste este reporte anteriormente" });
    return;
  }

  await db.insert(deathConfirmationsTable).values({
    id: generateId(),
    deathReportId: reportId,
    trustedContactId: contact.id,
    decision: "confirmed",
    comments: comments?.trim() || null,
  });

  writeAuditLog({
    action: "death_report_confirmed",
    userId: report.userId,
    actorId: contact.id,
    actorType: "trusted_contact",
    metadata: { reportId, via: "invite_token" },
  }).catch(() => {});

  // Auto-release check: all contacts must have confirmed AND minimum 2
  const allContacts = await db
    .select()
    .from(trustedContactsTable)
    .where(eq(trustedContactsTable.userId, report.userId));

  const allConfirmations = await db
    .select()
    .from(deathConfirmationsTable)
    .where(eq(deathConfirmationsTable.deathReportId, reportId));

  const confirmedIds = new Set(allConfirmations.map((c) => c.trustedContactId));
  const allConfirmed = allContacts.every((c) => confirmedIds.has(c.id));

  if (allConfirmed && allContacts.length >= 2) {
    try {
      await db.update(deathReportsTable)
        .set({ status: "released", updatedAt: new Date() })
        .where(eq(deathReportsTable.id, reportId));

      const releaseId = generateId();
      await db.insert(releaseEventsTable).values({
        id: releaseId,
        userId: report.userId,
        deathReportId: report.id,
        releasedByAdminId: null,
        status: "active",
        releasedAt: new Date(),
      });

      const profiles = await db
        .select({ fullName: profilesTable.fullName })
        .from(profilesTable)
        .where(eq(profilesTable.userId, report.userId))
        .limit(1);
      const deceasedName = profiles[0]?.fullName ?? "Tu ser querido";

      const items = await db.select().from(legacyItemsTable).where(eq(legacyItemsTable.userId, report.userId));
      const itemIds = items.map((i) => i.id);
      let recipientIdSet = new Set<string>();
      if (itemIds.length > 0) {
        const links = await db.select().from(legacyItemRecipientsTable).where(inArray(legacyItemRecipientsTable.legacyItemId, itemIds));
        links.forEach((l) => recipientIdSet.add(l.recipientId));
      }
      const directRecipients = await db.select().from(recipientsTable).where(eq(recipientsTable.userId, report.userId));
      directRecipients.forEach((r) => recipientIdSet.add(r.id));

      const allRecipients = recipientIdSet.size > 0
        ? await db.select().from(recipientsTable).where(inArray(recipientsTable.id, [...recipientIdSet]))
        : [];

      const appUrl = getAppUrl();
      for (const recipient of allRecipients) {
        const token = randomBytes(32).toString("hex");
        const expiresAt = new Date(Date.now() + 365 * 24 * 60 * 60 * 1000);
        await db.insert(recipientAccessTokensTable).values({
          id: generateId(),
          recipientId: recipient.id,
          releaseEventId: releaseId,
          token,
          expiresAt,
        });
        sendAccessLinkEmail({
          toEmail: recipient.email,
          toName: recipient.fullName,
          deceasedName,
          relationship: recipient.relationship,
          accessUrl: `${appUrl}/access/${token}`,
        }).catch(() => {});
      }

      await db.update(activationSettingsTable)
        .set({ status: "released", updatedAt: new Date() })
        .where(eq(activationSettingsTable.userId, report.userId))
        .catch(() => {});

      writeAuditLog({
        action: "legacy_released_auto",
        userId: report.userId,
        actorType: "system",
        metadata: { reportId, via: "invite_token" },
      }).catch(() => {});

      res.json({ success: true, released: true, message: "Todos los contactos han confirmado. El legado ha sido liberado." });
      return;
    } catch (err) {
      console.error("[auto-release]", err);
    }
  }

  res.json({
    success: true,
    released: false,
    message: "Confirmación registrada. Esperando que confirmen todos los contactos de confianza.",
  });
});

export default router;
