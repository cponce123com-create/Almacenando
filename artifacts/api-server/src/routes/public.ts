import { Router } from "express";
import multer from "multer";
import { uploadToCloudinary } from "../lib/cloudinary.js";
import { db } from "@workspace/db";
import {
  profilesTable,
  legacyItemsTable,
  trustedContactsTable,
  deathReportsTable,
  deathConfirmationsTable,
  releaseEventsTable,
  recipientAccessTokensTable,
  recipientsTable,
  legacyItemRecipientsTable,
  activationSettingsTable,
} from "@workspace/db";
import { eq, and, inArray } from "drizzle-orm";
import { generateId } from "../lib/id.js";
import { randomBytes } from "crypto";
import { sendDeathReportEmail, sendAccessLinkEmail } from "../lib/email.js";
import { deathReportLimiter, lookupLimiter } from "../lib/rate-limit.js";
import { writeAuditLog } from "../lib/audit.js";

const certUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (file.mimetype.startsWith("image/")) cb(null, true);
    else cb(new Error("Solo se permiten imágenes"));
  },
});

function getAppUrl(): string {
  if (process.env.APP_URL) return process.env.APP_URL.replace(/\/$/, "");
  if (process.env.REPLIT_DOMAINS) return `https://${process.env.REPLIT_DOMAINS.split(",")[0]}`;
  return "https://legado.replit.app";
}

const router = Router();

// Public DNI check — only returns boolean, no personal data
router.get("/legacy-check", async (req, res) => {
  const { dni } = req.query;

  if (!dni || typeof dni !== "string" || dni.trim().length < 3) {
    res.status(400).json({ error: "DNI inválido" });
    return;
  }

  const profiles = await db
    .select({ userId: profilesTable.userId, fullName: profilesTable.fullName })
    .from(profilesTable)
    .where(eq(profilesTable.dni, dni.trim().toUpperCase()))
    .limit(1);

  if (profiles.length === 0) {
    res.json({ hasLegacy: false });
    return;
  }

  const items = await db
    .select({ id: legacyItemsTable.id })
    .from(legacyItemsTable)
    .where(eq(legacyItemsTable.userId, profiles[0]!.userId))
    .limit(1);

  res.json({ hasLegacy: items.length > 0 });
});

// Look up trusted contacts for a deceased person by their DNI
// Returns only names — no personal data — so anyone can use this
router.post("/report-death/lookup", lookupLimiter, async (req, res) => {
  const { deceasedDni } = req.body;

  if (!deceasedDni || typeof deceasedDni !== "string") {
    res.status(400).json({ error: "deceasedDni es requerido" });
    return;
  }

  const deceasedProfile = await db
    .select({ userId: profilesTable.userId, fullName: profilesTable.fullName })
    .from(profilesTable)
    .where(eq(profilesTable.dni, deceasedDni.trim().toUpperCase()))
    .limit(1);

  if (deceasedProfile.length === 0) {
    res.status(404).json({ error: "No se encontró ningún usuario con ese DNI" });
    return;
  }

  const contacts = await db
    .select({ id: trustedContactsTable.id, fullName: trustedContactsTable.fullName })
    .from(trustedContactsTable)
    .where(eq(trustedContactsTable.userId, deceasedProfile[0]!.userId));

  if (contacts.length === 0) {
    res.status(404).json({ error: "Esta persona no tiene contactos de confianza registrados" });
    return;
  }

  res.json({
    deceasedName: deceasedProfile[0]!.fullName,
    deceasedUserId: deceasedProfile[0]!.userId,
    trustedContacts: contacts.map((c) => ({ id: c.id, fullName: c.fullName })),
  });
});

// Validate reporter DNI against trusted contacts
router.post("/report-death/validate", lookupLimiter, async (req, res) => {
  const { deceasedUserId, reporterDni } = req.body;

  if (!deceasedUserId || !reporterDni) {
    res.status(400).json({ error: "deceasedUserId y reporterDni son requeridos" });
    return;
  }

  const trustedContacts = await db
    .select()
    .from(trustedContactsTable)
    .where(
      and(
        eq(trustedContactsTable.userId, deceasedUserId),
        eq(trustedContactsTable.dni, reporterDni.trim().toUpperCase())
      )
    )
    .limit(1);

  if (trustedContacts.length === 0) {
    res.status(403).json({ error: "Tu DNI no está registrado como contacto de confianza de esta persona" });
    return;
  }

  const contact = trustedContacts[0]!;

  const allContacts = await db
    .select({ id: trustedContactsTable.id, fullName: trustedContactsTable.fullName })
    .from(trustedContactsTable)
    .where(eq(trustedContactsTable.userId, deceasedUserId));

  res.json({
    valid: true,
    contactId: contact.id,
    contactName: contact.fullName,
    otherContacts: allContacts
      .filter((c) => c.id !== contact.id)
      .map((c) => ({ id: c.id, fullName: c.fullName })),
  });
});

// Public certificate image upload — no auth required, 10 MB limit, images only
router.post("/report-death/upload-certificate", deathReportLimiter, certUpload.single("image"), async (req, res) => {
  try {
    if (!req.file) {
      res.status(400).json({ error: "No se recibió ninguna imagen" });
      return;
    }
    const result = await uploadToCloudinary(req.file.buffer, {
      resource_type: "image",
      folder: "legado/certificates",
    });
    res.json({ url: result.secure_url });
  } catch (err: any) {
    res.status(500).json({ error: err.message || "Error al subir la imagen" });
  }
});

// Submit a death report by a trusted contact identified by DNI
router.post("/report-death/submit", deathReportLimiter, async (req, res) => {
  const { contactId, deceasedUserId, deceasedName, reporterDni, notes, certificateImageUrl, certificateWithPersonUrl } = req.body;

  if (!contactId || !deceasedUserId) {
    res.status(400).json({ error: "contactId y deceasedUserId son requeridos" });
    return;
  }

  const contactRows = await db
    .select()
    .from(trustedContactsTable)
    .where(and(eq(trustedContactsTable.id, contactId), eq(trustedContactsTable.userId, deceasedUserId)))
    .limit(1);

  if (contactRows.length === 0) {
    res.status(403).json({ error: "Contacto no autorizado" });
    return;
  }

  const reporter = contactRows[0]!;

  const existingReports = await db
    .select()
    .from(deathReportsTable)
    .where(and(eq(deathReportsTable.userId, deceasedUserId), eq(deathReportsTable.status, "pending")))
    .limit(1);

  let reportId: string;
  if (existingReports.length > 0) {
    reportId = existingReports[0]!.id;
  } else {
    reportId = generateId();
    await db.insert(deathReportsTable).values({
      id: reportId,
      userId: deceasedUserId,
      reportedByContactId: contactId,
      notes: notes || null,
      status: "pending",
      certificateImageUrl: certificateImageUrl || null,
      certificateWithPersonUrl: certificateWithPersonUrl || null,
    });
  }

  // Send email to all other trusted contacts (each gets their personal token URL)
  const otherContacts = await db
    .select()
    .from(trustedContactsTable)
    .where(eq(trustedContactsTable.userId, deceasedUserId));

  const emailsToSend = otherContacts.filter((c) => c.id !== contactId && c.email);

  const appUrl = getAppUrl();

  for (const recipient of emailsToSend) {
    const tokenParam = recipient.confirmToken ? `?token=${recipient.confirmToken}` : "";
    const confirmUrl = `${appUrl}/confirm-death/${reportId}${tokenParam}`;
    sendDeathReportEmail({
      toEmail: recipient.email,
      toName: recipient.fullName,
      reporterName: reporter.fullName,
      deceasedName: deceasedName || "la persona registrada",
      reporterDni: reporterDni || "",
      confirmUrl,
    }).catch((err) => {
      console.error(`[email] Failed to send to ${recipient.email}:`, err.message);
    });
  }

  writeAuditLog({
    action: "death_report_submitted",
    userId: deceasedUserId,
    actorId: contactId,
    actorType: "trusted_contact",
    metadata: { reportId },
  }).catch(() => {});

  res.json({
    success: true,
    reportId,
    confirmUrl,
    message: "Reporte registrado. El otro contacto de confianza debe confirmar también.",
  });
});

// Get public info about a death report for the confirmation page
router.get("/report-death/confirm-info/:reportId", async (req, res) => {
  const { reportId } = req.params;

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

  const deceased = await db
    .select({
      fullName: profilesTable.fullName,
      avatarUrl: profilesTable.avatarUrl,
    })
    .from(profilesTable)
    .where(eq(profilesTable.userId, report.userId))
    .limit(1);

  const reporter = await db
    .select({ fullName: trustedContactsTable.fullName })
    .from(trustedContactsTable)
    .where(eq(trustedContactsTable.id, report.reportedByContactId))
    .limit(1);

  res.json({
    reportId: report.id,
    status: report.status,
    deceasedName: deceased[0]?.fullName ?? "Persona desconocida",
    deceasedAvatarUrl: deceased[0]?.avatarUrl ?? null,
    reportedByName: reporter[0]?.fullName ?? "Contacto registrado",
    createdAt: report.createdAt,
  });
});

// Confirm a death report (second trusted contact)
router.post("/report-death/confirm/:reportId", async (req, res) => {
  const { reportId } = req.params;
  const { confirmToken, confirmerDni, comments } = req.body;

  if (!confirmToken && !confirmerDni) {
    res.status(400).json({ error: "Se requiere el token de confirmación del email o tu DNI" });
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

  // Primary auth: token from email link (secure) — fallback to DNI for contacts without token
  let contact: typeof trustedContactsTable.$inferSelect | undefined;

  if (confirmToken) {
    const byToken = await db
      .select()
      .from(trustedContactsTable)
      .where(
        and(
          eq(trustedContactsTable.userId, report.userId),
          eq(trustedContactsTable.confirmToken, confirmToken)
        )
      )
      .limit(1);
    contact = byToken[0];
    if (contact?.confirmTokenExpiresAt && contact.confirmTokenExpiresAt < new Date()) {
      res.status(403).json({ error: "Este enlace ha expirado. Pide al titular que regenere tu invitación." });
      return;
    }
  }

  if (!contact && confirmerDni) {
    const byDni = await db
      .select()
      .from(trustedContactsTable)
      .where(
        and(
          eq(trustedContactsTable.userId, report.userId),
          eq(trustedContactsTable.dni, confirmerDni.trim().toUpperCase())
        )
      )
      .limit(1);
    contact = byDni[0];
  }

  if (!contact) {
    res.status(403).json({ error: "Token inválido o DNI no registrado como contacto de confianza" });
    return;
  }

  const confirmer = contact;

  // Don't allow the original reporter to double-confirm
  if (confirmer.id === report.reportedByContactId) {
    res.status(400).json({ error: "Ya eres quien inició este reporte. Debe confirmarlo otro contacto de confianza." });
    return;
  }

  // Check if already confirmed by this contact
  const existing = await db
    .select()
    .from(deathConfirmationsTable)
    .where(
      and(
        eq(deathConfirmationsTable.deathReportId, reportId),
        eq(deathConfirmationsTable.trustedContactId, confirmer.id)
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
    trustedContactId: confirmer.id,
    decision: "confirmed",
    comments: comments?.trim() || null,
  });

  writeAuditLog({
    action: "death_report_confirmed",
    userId: report.userId,
    actorId: confirmer.id,
    actorType: "trusted_contact",
    metadata: { reportId },
  }).catch(() => {});

  // Check if ALL trusted contacts for this user have now confirmed
  const allContacts = await db
    .select()
    .from(trustedContactsTable)
    .where(eq(trustedContactsTable.userId, report.userId));

  const allConfirmations = await db
    .select()
    .from(deathConfirmationsTable)
    .where(eq(deathConfirmationsTable.deathReportId, reportId));

  const confirmedContactIds = new Set(allConfirmations.map((c) => c.trustedContactId));
  const allConfirmed = allContacts.every((c) => confirmedContactIds.has(c.id));

  if (allConfirmed && allContacts.length >= 2) {
    // All trusted contacts confirmed — auto-release the legacy
    try {
      await db
        .update(deathReportsTable)
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

      // Get deceased profile
      const profiles = await db
        .select()
        .from(profilesTable)
        .where(eq(profilesTable.userId, report.userId))
        .limit(1);
      const deceasedName = profiles[0]?.fullName ?? "Tu ser querido";

      // Find all recipients linked to this user's legacy items
      const items = await db
        .select()
        .from(legacyItemsTable)
        .where(eq(legacyItemsTable.userId, report.userId));

      const itemIds = items.map((i) => i.id);
      let uniqueRecipientIds: string[] = [];
      if (itemIds.length > 0) {
        const links = await db
          .select()
          .from(legacyItemRecipientsTable)
          .where(inArray(legacyItemRecipientsTable.legacyItemId, itemIds));
        uniqueRecipientIds = [...new Set(links.map((l) => l.recipientId))];
      }

      // Also include all recipients for this user regardless of item links
      const directRecipients = await db
        .select()
        .from(recipientsTable)
        .where(eq(recipientsTable.userId, report.userId));
      for (const r of directRecipients) {
        if (!uniqueRecipientIds.includes(r.id)) uniqueRecipientIds.push(r.id);
      }

      const appUrl = getAppUrl();

      // Batch-load all recipients — no N+1
      const recipientRows = uniqueRecipientIds.length > 0
        ? await db.select().from(recipientsTable).where(inArray(recipientsTable.id, uniqueRecipientIds))
        : [];

      // Generate access token + send email for each recipient
      for (const recipient of recipientRows) {
        const token = randomBytes(32).toString("hex");
        const expiresAt = new Date(Date.now() + 365 * 24 * 60 * 60 * 1000);

        await db.insert(recipientAccessTokensTable).values({
          id: generateId(),
          recipientId: recipient.id,
          releaseEventId: releaseId,
          token,
          expiresAt,
        });

        const accessUrl = `${appUrl}/access/${token}`;

        sendAccessLinkEmail({
          toEmail: recipient.email,
          toName: recipient.fullName,
          deceasedName,
          relationship: recipient.relationship,
          accessUrl,
        }).catch((err) => console.error("[email] Failed to send access link to", recipient.email, err));
      }

      await db
        .update(activationSettingsTable)
        .set({ status: "released", updatedAt: new Date() })
        .where(eq(activationSettingsTable.userId, report.userId))
        .catch(() => {});

      writeAuditLog({
        action: "legacy_released_auto",
        userId: report.userId,
        actorType: "system",
        metadata: { reportId, confirmerContactId: confirmer.id },
      }).catch(() => {});

      res.json({
        success: true,
        released: true,
        message: "Todos los contactos han confirmado. El legado ha sido liberado y los destinatarios han recibido sus enlaces de acceso.",
      });
      return;
    } catch (err) {
      console.error("[auto-release] Error during auto-release:", err);
    }
  }

  res.json({
    success: true,
    released: false,
    message: "Confirmación registrada. Esperando que confirmen todos los contactos de confianza.",
  });
});

export default router;
