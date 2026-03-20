import { Router } from "express";
import { db } from "@workspace/db";
import {
  deathReportsTable,
  deathConfirmationsTable,
  trustedContactsTable,
  activationSettingsTable,
  releaseEventsTable,
  recipientAccessTokensTable,
  legacyItemsTable,
  legacyItemRecipientsTable,
  recipientsTable,
} from "@workspace/db";
import { eq, and, inArray } from "drizzle-orm";
import { generateId } from "../lib/id.js";
import { randomBytes } from "crypto";

const router = Router();

router.post("/", async (req, res) => {
  const { trustedContactId, notes } = req.body;
  if (!trustedContactId) {
    res.status(400).json({ error: "trustedContactId is required" });
    return;
  }

  const contacts = await db.select().from(trustedContactsTable).where(eq(trustedContactsTable.id, trustedContactId)).limit(1);
  if (contacts.length === 0) {
    res.status(404).json({ error: "Trusted contact not found" });
    return;
  }

  const contact = contacts[0]!;
  const userId = contact.userId;

  const existingReports = await db.select().from(deathReportsTable).where(and(eq(deathReportsTable.userId, userId), eq(deathReportsTable.status, "pending"))).limit(1);
  
  let reportId: string;
  if (existingReports.length > 0) {
    reportId = existingReports[0]!.id;
  } else {
    reportId = generateId();
    await db.insert(deathReportsTable).values({
      id: reportId,
      userId,
      reportedByContactId: trustedContactId,
      notes,
      status: "pending",
    });
  }

  const report = await db.select().from(deathReportsTable).where(eq(deathReportsTable.id, reportId)).limit(1);
  const r = report[0]!;
  res.status(201).json({
    id: r.id,
    userId: r.userId,
    reportedByContactId: r.reportedByContactId,
    notes: r.notes,
    status: r.status,
    createdAt: r.createdAt.toISOString(),
    updatedAt: r.updatedAt.toISOString(),
  });
});

router.post("/:id/confirm", async (req, res) => {
  const { trustedContactId, decision, comments } = req.body;
  if (!trustedContactId || !decision) {
    res.status(400).json({ error: "trustedContactId and decision are required" });
    return;
  }

  const reports = await db.select().from(deathReportsTable).where(eq(deathReportsTable.id, req.params.id)).limit(1);
  if (reports.length === 0) {
    res.status(404).json({ error: "Death report not found" });
    return;
  }

  const report = reports[0]!;

  const existing = await db.select().from(deathConfirmationsTable).where(and(eq(deathConfirmationsTable.deathReportId, req.params.id), eq(deathConfirmationsTable.trustedContactId, trustedContactId))).limit(1);
  if (existing.length > 0) {
    res.status(409).json({ error: "Already confirmed" });
    return;
  }

  await db.insert(deathConfirmationsTable).values({
    id: generateId(),
    deathReportId: req.params.id,
    trustedContactId,
    decision,
    comments,
    confirmedAt: new Date(),
  });

  const confirmations = await db.select().from(deathConfirmationsTable).where(eq(deathConfirmationsTable.deathReportId, req.params.id));
  const confirmedCount = confirmations.filter((c) => c.decision === "confirmed").length;

  const settings = await db.select().from(activationSettingsTable).where(eq(activationSettingsTable.userId, report.userId)).limit(1);
  const minConfirmations = settings.length > 0 ? settings[0]!.minConfirmations : 2;

  if (confirmedCount >= minConfirmations) {
    await db.update(deathReportsTable).set({ status: "admin_review", updatedAt: new Date() }).where(eq(deathReportsTable.id, req.params.id));
  }

  res.json({ message: "Confirmation recorded" });
});

export default router;
