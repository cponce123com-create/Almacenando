import { Router } from "express";
import { db } from "@workspace/db";
import {
  profilesTable,
  legacyItemsTable,
  trustedContactsTable,
  deathReportsTable,
} from "@workspace/db";
import { eq, and } from "drizzle-orm";
import { generateId } from "../lib/id.js";
import { sendDeathReportEmail } from "../lib/email.js";

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

  for (const recipient of emailsToSend) {
    sendDeathReportEmail({
      toEmail: recipient.email,
      toName: recipient.fullName,
      reporterName: reporter.fullName,
      deceasedName: deceasedName || "la persona registrada",
      reporterDni: reporterDni || "",
    }).catch((err) => {
      console.error(`[email] Failed to send to ${recipient.email}:`, err.message);
    });
  }

  res.json({
    success: true,
    reportId,
    message: "Reporte registrado. El otro contacto de confianza debe confirmar también.",
  });
});

export default router;
