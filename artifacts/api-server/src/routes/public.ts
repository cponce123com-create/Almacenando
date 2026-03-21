import { Router } from "express";
import { db } from "@workspace/db";
import {
  profilesTable,
  legacyItemsTable,
  trustedContactsTable,
  deathReportsTable,
  deathConfirmationsTable,
} from "@workspace/db";
import { eq, and } from "drizzle-orm";
import { generateId } from "../lib/id.js";
import { sendDeathReportEmail } from "../lib/email.js";

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
router.post("/report-death/lookup", async (req, res) => {
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
router.post("/report-death/validate", async (req, res) => {
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

// Submit a death report by a trusted contact identified by DNI
router.post("/report-death/submit", async (req, res) => {
  const { contactId, deceasedUserId, deceasedName, reporterDni, notes } = req.body;

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
    });
  }

  // Send email to all other trusted contacts
  const otherContacts = await db
    .select()
    .from(trustedContactsTable)
    .where(eq(trustedContactsTable.userId, deceasedUserId));

  const emailsToSend = otherContacts.filter((c) => c.id !== contactId && c.email);

  const confirmUrl = `${getAppUrl()}/confirm-death/${reportId}`;

  for (const recipient of emailsToSend) {
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
  const { confirmerDni, comments } = req.body;

  if (!confirmerDni) {
    res.status(400).json({ error: "Tu DNI es requerido" });
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

  // Find the confirmer's trusted contact record
  const contact = await db
    .select()
    .from(trustedContactsTable)
    .where(
      and(
        eq(trustedContactsTable.userId, report.userId),
        eq(trustedContactsTable.dni, confirmerDni.trim().toUpperCase())
      )
    )
    .limit(1);

  if (contact.length === 0) {
    res.status(403).json({ error: "Tu DNI no está registrado como contacto de confianza de esta persona" });
    return;
  }

  const confirmer = contact[0]!;

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

  res.json({
    success: true,
    message: "Confirmación registrada. El administrador revisará el caso y decidirá si liberar el legado.",
  });
});

export default router;
