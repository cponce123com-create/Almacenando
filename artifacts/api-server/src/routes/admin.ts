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
import { eq, inArray } from "drizzle-orm";
import { hashPassword, comparePassword, signAdminToken, requireAdmin } from "../lib/auth.js";
import { generateId } from "../lib/id.js";
import { randomBytes } from "crypto";

const router = Router();

router.post("/login", async (req, res) => {
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
  if (setupKey !== (process.env.ADMIN_SETUP_KEY || "legado-admin-setup")) {
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

router.get("/death-reports", requireAdmin, async (req, res) => {
  const reports = await db.select().from(deathReportsTable);
  const result = await Promise.all(reports.map(async (r) => {
    const users = await db.select().from(usersTable).where(eq(usersTable.id, r.userId)).limit(1);
    const profiles = await db.select().from(profilesTable).where(eq(profilesTable.userId, r.userId)).limit(1);
    const confirmations = await db.select().from(deathConfirmationsTable).where(eq(deathConfirmationsTable.deathReportId, r.id));
    return {
      id: r.id,
      userId: r.userId,
      userEmail: users[0]?.email ?? "unknown",
      userName: profiles[0]?.fullName ?? null,
      status: r.status,
      confirmationsCount: confirmations.length,
      createdAt: r.createdAt.toISOString(),
    };
  }));
  res.json(result);
});

router.get("/death-reports/:id", requireAdmin, async (req, res) => {
  const reports = await db.select().from(deathReportsTable).where(eq(deathReportsTable.id, req.params.id)).limit(1);
  if (reports.length === 0) {
    res.status(404).json({ error: "Report not found" });
    return;
  }
  const r = reports[0]!;
  const users = await db.select().from(usersTable).where(eq(usersTable.id, r.userId)).limit(1);
  const profiles = await db.select().from(profilesTable).where(eq(profilesTable.userId, r.userId)).limit(1);
  const confirmations = await db.select().from(deathConfirmationsTable).where(eq(deathConfirmationsTable.deathReportId, r.id));
  const enrichedConfirmations = await Promise.all(confirmations.map(async (c) => {
    const contacts = await db.select().from(trustedContactsTable).where(eq(trustedContactsTable.id, c.trustedContactId)).limit(1);
    return {
      id: c.id,
      trustedContactName: contacts[0]?.fullName ?? "Unknown",
      decision: c.decision,
      comments: c.comments,
      confirmedAt: c.confirmedAt.toISOString(),
    };
  }));

  res.json({
    id: r.id,
    userId: r.userId,
    userEmail: users[0]?.email ?? "unknown",
    userName: profiles[0]?.fullName ?? null,
    notes: r.notes,
    status: r.status,
    confirmations: enrichedConfirmations,
    createdAt: r.createdAt.toISOString(),
    updatedAt: r.updatedAt.toISOString(),
  });
});

router.post("/death-reports/:id/approve", requireAdmin, async (req, res) => {
  const adminId = (req as typeof req & { adminId: string }).adminId;
  const reports = await db.select().from(deathReportsTable).where(eq(deathReportsTable.id, req.params.id)).limit(1);
  if (reports.length === 0) {
    res.status(404).json({ error: "Report not found" });
    return;
  }
  const report = reports[0]!;

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

  const items = await db.select().from(legacyItemsTable).where(eq(legacyItemsTable.userId, report.userId));
  const itemIds = items.map((i) => i.id);
  
  let recipientIds: string[] = [];
  if (itemIds.length > 0) {
    const links = await db.select().from(legacyItemRecipientsTable).where(inArray(legacyItemRecipientsTable.legacyItemId, itemIds));
    recipientIds = [...new Set(links.map((l) => l.recipientId))];
  }

  for (const recipientId of recipientIds) {
    const token = randomBytes(32).toString("hex");
    const expiresAt = new Date(Date.now() + 365 * 24 * 60 * 60 * 1000);
    await db.insert(recipientAccessTokensTable).values({
      id: generateId(),
      recipientId,
      releaseEventId: releaseId,
      token,
      expiresAt,
    });
  }

  await db.update(activationSettingsTable).set({ status: "released", updatedAt: new Date() }).where(eq(activationSettingsTable.userId, report.userId));

  res.json({ message: "Release approved and access tokens generated" });
});

router.post("/death-reports/:id/reject", requireAdmin, async (req, res) => {
  const reports = await db.select().from(deathReportsTable).where(eq(deathReportsTable.id, req.params.id)).limit(1);
  if (reports.length === 0) {
    res.status(404).json({ error: "Report not found" });
    return;
  }
  await db.update(deathReportsTable).set({ status: "rejected", updatedAt: new Date() }).where(eq(deathReportsTable.id, req.params.id));
  res.json({ message: "Release rejected" });
});

export default router;
