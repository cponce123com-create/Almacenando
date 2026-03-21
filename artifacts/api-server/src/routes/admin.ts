import { Router } from "express";
import { db } from "@workspace/db";
import {
  adminsTable,
  deathReportsTable,
  deathConfirmationsTable,
  trustedContactsTable,
  usersTable,
  profilesTable,
  releaseEventsTable,
  recipientAccessTokensTable,
  recipientsTable,
  legacyItemsTable,
  legacyItemRecipientsTable,
  activationSettingsTable,
} from "@workspace/db";
import { eq, inArray, count } from "drizzle-orm";
import { hashPassword, comparePassword, signAdminToken, requireAdmin } from "../lib/auth.js";
import { generateId } from "../lib/id.js";
import { randomBytes } from "crypto";
import { sendAccessLinkEmail } from "../lib/email.js";
import { authLoginLimiter } from "../lib/rate-limit.js";
import { writeAuditLog } from "../lib/audit.js";

const router = Router();

router.post("/login", authLoginLimiter, async (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) {
    res.status(400).json({ error: "Email and password are required" });
    return;
  }

  const admins = await db.select().from(adminsTable).where(eq(adminsTable.email, email)).limit(1);
  if (admins.length === 0) {
    res.status(401).json({ error: "Invalid credentials" });
    return;
  }

  const admin = admins[0]!;
  const valid = await comparePassword(password, admin.passwordHash);
  if (!valid) {
    res.status(401).json({ error: "Invalid credentials" });
    return;
  }

  const token = signAdminToken({ adminId: admin.id, email: admin.email });
  res.json({
    user: { id: admin.id, email: admin.email, status: "active", createdAt: admin.createdAt.toISOString() },
    token,
  });
});

router.post("/setup", async (req, res) => {
  const { email, password, name, setupKey } = req.body;
  const adminSetupKey = process.env.ADMIN_SETUP_KEY;
  if (!adminSetupKey) {
    res.status(503).json({ error: "Admin setup is not configured on this server." });
    return;
  }
  if (setupKey !== adminSetupKey) {
    res.status(403).json({ error: "Invalid setup key" });
    return;
  }
  const existing = await db.select().from(adminsTable).where(eq(adminsTable.email, email)).limit(1);
  if (existing.length > 0) {
    res.status(409).json({ error: "Admin already exists" });
    return;
  }
  const passwordHash = await hashPassword(password);
  const id = generateId();
  await db.insert(adminsTable).values({ id, name: name || "Admin", email, passwordHash, role: "admin" });
  res.status(201).json({ message: "Admin created" });
});

// List all registered users with stats — batched queries, no N+1
router.get("/users", requireAdmin, async (req, res) => {
  const users = await db.select().from(usersTable).orderBy(usersTable.createdAt);
  if (users.length === 0) { res.json([]); return; }

  const userIds = users.map((u) => u.id);

  const [profiles, legacyItemCounts, recipientCounts, trustedCounts, deathReports] = await Promise.all([
    db.select({ userId: profilesTable.userId, fullName: profilesTable.fullName })
      .from(profilesTable).where(inArray(profilesTable.userId, userIds)),
    db.select({ userId: legacyItemsTable.userId, c: count() })
      .from(legacyItemsTable).where(inArray(legacyItemsTable.userId, userIds))
      .groupBy(legacyItemsTable.userId),
    db.select({ userId: recipientsTable.userId, c: count() })
      .from(recipientsTable).where(inArray(recipientsTable.userId, userIds))
      .groupBy(recipientsTable.userId),
    db.select({ userId: trustedContactsTable.userId, c: count() })
      .from(trustedContactsTable).where(inArray(trustedContactsTable.userId, userIds))
      .groupBy(trustedContactsTable.userId),
    db.select({ userId: deathReportsTable.userId, status: deathReportsTable.status })
      .from(deathReportsTable).where(inArray(deathReportsTable.userId, userIds)),
  ]);

  const profileMap = new Map(profiles.map((p) => [p.userId, p.fullName]));
  const itemsMap = new Map(legacyItemCounts.map((r) => [r.userId, r.c]));
  const recipMap = new Map(recipientCounts.map((r) => [r.userId, r.c]));
  const trustedMap = new Map(trustedCounts.map((r) => [r.userId, r.c]));
  const reportMap = new Map(deathReports.map((r) => [r.userId, r.status]));

  res.json(users.map((u) => ({
    id: u.id,
    email: u.email,
    fullName: profileMap.get(u.id) ?? null,
    status: u.status,
    legacyItemsCount: itemsMap.get(u.id) ?? 0,
    recipientsCount: recipMap.get(u.id) ?? 0,
    trustedContactsCount: trustedMap.get(u.id) ?? 0,
    deathReportStatus: reportMap.get(u.id) ?? null,
    createdAt: u.createdAt.toISOString(),
  })));
});

// Suspend a user
router.post("/users/:id/suspend", requireAdmin, async (req, res) => {
  await db.update(usersTable).set({ status: "suspended" }).where(eq(usersTable.id, req.params.id));
  res.json({ message: "User suspended" });
});

// Reactivate a user
router.post("/users/:id/activate", requireAdmin, async (req, res) => {
  await db.update(usersTable).set({ status: "active" }).where(eq(usersTable.id, req.params.id));
  res.json({ message: "User activated" });
});

// List death reports — batched queries, no N+1
router.get("/death-reports", requireAdmin, async (req, res) => {
  const reports = await db.select().from(deathReportsTable);
  if (reports.length === 0) { res.json([]); return; }

  const reportIds = reports.map((r) => r.id);
  const userIds = [...new Set(reports.map((r) => r.userId))];

  const [users, profiles, confirmationCounts] = await Promise.all([
    db.select({ id: usersTable.id, email: usersTable.email })
      .from(usersTable).where(inArray(usersTable.id, userIds)),
    db.select({ userId: profilesTable.userId, fullName: profilesTable.fullName })
      .from(profilesTable).where(inArray(profilesTable.userId, userIds)),
    db.select({ deathReportId: deathConfirmationsTable.deathReportId, c: count() })
      .from(deathConfirmationsTable).where(inArray(deathConfirmationsTable.deathReportId, reportIds))
      .groupBy(deathConfirmationsTable.deathReportId),
  ]);

  const userMap = new Map(users.map((u) => [u.id, u.email]));
  const profileMap = new Map(profiles.map((p) => [p.userId, p.fullName]));
  const confMap = new Map(confirmationCounts.map((c) => [c.deathReportId, c.c]));

  res.json(reports.map((r) => ({
    id: r.id,
    userId: r.userId,
    userEmail: userMap.get(r.userId) ?? "unknown",
    userName: profileMap.get(r.userId) ?? null,
    status: r.status,
    confirmationsCount: confMap.get(r.id) ?? 0,
    createdAt: r.createdAt.toISOString(),
  })));
});

// Get single death report — batched queries, no N+1 on confirmations
router.get("/death-reports/:id", requireAdmin, async (req, res) => {
  const reports = await db.select().from(deathReportsTable).where(eq(deathReportsTable.id, req.params.id)).limit(1);
  if (reports.length === 0) {
    res.status(404).json({ error: "Report not found" });
    return;
  }
  const r = reports[0]!;

  const [users, profiles, confirmations] = await Promise.all([
    db.select({ email: usersTable.email }).from(usersTable).where(eq(usersTable.id, r.userId)).limit(1),
    db.select({ fullName: profilesTable.fullName }).from(profilesTable).where(eq(profilesTable.userId, r.userId)).limit(1),
    db.select().from(deathConfirmationsTable).where(eq(deathConfirmationsTable.deathReportId, r.id)),
  ]);

  // Batch-load trusted contacts for all confirmations in one query
  const contactIds = confirmations.map((c) => c.trustedContactId);
  const contactRows = contactIds.length > 0
    ? await db.select({ id: trustedContactsTable.id, fullName: trustedContactsTable.fullName })
        .from(trustedContactsTable).where(inArray(trustedContactsTable.id, contactIds))
    : [];
  const contactMap = new Map(contactRows.map((c) => [c.id, c.fullName]));

  res.json({
    id: r.id,
    userId: r.userId,
    userEmail: users[0]?.email ?? "unknown",
    userName: profiles[0]?.fullName ?? null,
    notes: r.notes,
    status: r.status,
    confirmations: confirmations.map((c) => ({
      id: c.id,
      trustedContactName: contactMap.get(c.trustedContactId) ?? "Unknown",
      decision: c.decision,
      comments: c.comments,
      confirmedAt: c.confirmedAt.toISOString(),
    })),
    createdAt: r.createdAt.toISOString(),
    updatedAt: r.updatedAt.toISOString(),
  });
});

router.post("/death-reports/:id/approve", requireAdmin, async (req, res) => {
  const adminId = (req as typeof req & { adminId: string }).adminId;
  const { force } = req.body;

  const reports = await db.select().from(deathReportsTable).where(eq(deathReportsTable.id, req.params.id)).limit(1);
  if (reports.length === 0) {
    res.status(404).json({ error: "Report not found" });
    return;
  }
  const report = reports[0]!;

  if (report.status === "released") {
    res.status(409).json({ error: "Este legado ya fue liberado anteriormente." });
    return;
  }
  if (report.status === "rejected") {
    res.status(409).json({ error: "Este reporte fue rechazado y no puede liberarse." });
    return;
  }

  // Verify minimum confirmations unless admin explicitly overrides with force:true
  if (!force) {
    const confirmations = await db
      .select()
      .from(deathConfirmationsTable)
      .where(eq(deathConfirmationsTable.deathReportId, req.params.id));
    const confirmedCount = confirmations.filter((c) => c.decision === "confirmed").length;

    const settings = await db
      .select()
      .from(activationSettingsTable)
      .where(eq(activationSettingsTable.userId, report.userId))
      .limit(1);
    const minConfirmations = settings[0]?.minConfirmations ?? 2;

    if (confirmedCount < minConfirmations) {
      res.status(422).json({
        error: `Este reporte solo tiene ${confirmedCount} de ${minConfirmations} confirmaciones requeridas. Usa force:true para aprobar de todas formas.`,
        confirmedCount,
        required: minConfirmations,
        canForce: true,
      });
      return;
    }
  }

  await db.update(deathReportsTable).set({ status: "released", updatedAt: new Date() }).where(eq(deathReportsTable.id, req.params.id));

  const releaseId = generateId();
  await db.insert(releaseEventsTable).values({
    id: releaseId,
    userId: report.userId,
    deathReportId: report.id,
    releasedByAdminId: adminId,
    status: "active",
    releasedAt: new Date(),
  });

  // Get deceased name
  const profiles = await db.select().from(profilesTable).where(eq(profilesTable.userId, report.userId)).limit(1);
  const deceasedName = profiles[0]?.fullName ?? "Tu ser querido";

  // Gather recipients from items + all direct recipients
  const items = await db.select().from(legacyItemsTable).where(eq(legacyItemsTable.userId, report.userId));
  const itemIds = items.map((i) => i.id);
  let uniqueRecipientIds: string[] = [];
  if (itemIds.length > 0) {
    const links = await db.select().from(legacyItemRecipientsTable).where(inArray(legacyItemRecipientsTable.legacyItemId, itemIds));
    uniqueRecipientIds = [...new Set(links.map((l) => l.recipientId))];
  }
  const directRecipients = await db.select().from(recipientsTable).where(eq(recipientsTable.userId, report.userId));
  for (const r of directRecipients) {
    if (!uniqueRecipientIds.includes(r.id)) uniqueRecipientIds.push(r.id);
  }

  const appUrl = process.env.APP_URL?.replace(/\/$/, "")
    ?? (process.env.REPLIT_DOMAINS ? `https://${process.env.REPLIT_DOMAINS.split(",")[0]}` : "https://legadoapp.replit.app");

  // Batch-load all recipients — no N+1
  const allRecipients = uniqueRecipientIds.length > 0
    ? await db.select().from(recipientsTable).where(inArray(recipientsTable.id, uniqueRecipientIds))
    : [];

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

    const accessUrl = `${appUrl}/access/${token}`;
    sendAccessLinkEmail({
      toEmail: recipient.email,
      toName: recipient.fullName,
      deceasedName,
      relationship: recipient.relationship,
      accessUrl,
    }).catch((err) => console.error("[admin-release] email error:", recipient.email, err));
  }

  await db.update(activationSettingsTable).set({ status: "released", updatedAt: new Date() }).where(eq(activationSettingsTable.userId, report.userId));

  writeAuditLog({
    action: "legacy_released_admin",
    userId: report.userId,
    actorId: adminId,
    actorType: "admin",
    metadata: { reportId: req.params.id, force: !!force },
  }).catch(() => {});

  res.json({ message: "Legado liberado. Los destinatarios han recibido sus enlaces de acceso." });
});

router.post("/death-reports/:id/reject", requireAdmin, async (req, res) => {
  const adminId = (req as typeof req & { adminId: string }).adminId;
  const reports = await db.select().from(deathReportsTable).where(eq(deathReportsTable.id, req.params.id)).limit(1);
  if (reports.length === 0) {
    res.status(404).json({ error: "Report not found" });
    return;
  }
  const { reason } = req.body;
  await db.update(deathReportsTable).set({ status: "rejected", updatedAt: new Date() }).where(eq(deathReportsTable.id, req.params.id));

  writeAuditLog({
    action: "legacy_rejected_admin",
    userId: reports[0]!.userId,
    actorId: adminId,
    actorType: "admin",
    metadata: { reportId: req.params.id, reason: reason ?? null },
  }).catch(() => {});

  res.json({ message: "Release rejected" });
});

router.delete("/death-reports/:id", requireAdmin, async (req, res) => {
  const reports = await db.select().from(deathReportsTable).where(eq(deathReportsTable.id, req.params.id)).limit(1);
  if (reports.length === 0) {
    res.status(404).json({ error: "Report not found" });
    return;
  }
  await db.delete(deathConfirmationsTable).where(eq(deathConfirmationsTable.deathReportId, req.params.id));
  await db.delete(deathReportsTable).where(eq(deathReportsTable.id, req.params.id));
  res.json({ message: "Report deleted" });
});

export default router;
