import { Router } from "express";
import { db } from "@workspace/db";
import { activationSettingsTable, trustedContactsTable, deathReportsTable, deathConfirmationsTable } from "@workspace/db";
import { eq, and } from "drizzle-orm";
import { requireAuth } from "../lib/auth.js";
import { generateId } from "../lib/id.js";

const router = Router();

const toSettings = (s: typeof activationSettingsTable.$inferSelect) => ({
  id: s.id,
  userId: s.userId,
  minConfirmations: s.minConfirmations,
  adminReviewRequired: s.adminReviewRequired,
  status: s.status,
  createdAt: s.createdAt.toISOString(),
  updatedAt: s.updatedAt.toISOString(),
});

router.get("/", requireAuth, async (req, res) => {
  const userId = (req as typeof req & { userId: string }).userId;
  const items = await db.select().from(activationSettingsTable).where(eq(activationSettingsTable.userId, userId)).limit(1);
  if (items.length === 0) {
    const id = generateId();
    await db.insert(activationSettingsTable).values({ id, userId, minConfirmations: 2, adminReviewRequired: true, status: "inactive" });
    const created = await db.select().from(activationSettingsTable).where(eq(activationSettingsTable.id, id)).limit(1);
    res.json(toSettings(created[0]!));
    return;
  }
  res.json(toSettings(items[0]!));
});

router.put("/", requireAuth, async (req, res) => {
  const userId = (req as typeof req & { userId: string }).userId;
  const { minConfirmations, adminReviewRequired } = req.body;

  const existing = await db.select().from(activationSettingsTable).where(eq(activationSettingsTable.userId, userId)).limit(1);
  if (existing.length === 0) {
    const id = generateId();
    await db.insert(activationSettingsTable).values({
      id, userId,
      minConfirmations: minConfirmations ?? 2,
      adminReviewRequired: adminReviewRequired ?? true,
      status: "inactive",
    });
    const created = await db.select().from(activationSettingsTable).where(eq(activationSettingsTable.id, id)).limit(1);
    res.json(toSettings(created[0]!));
    return;
  }

  await db.update(activationSettingsTable).set({
    minConfirmations: minConfirmations ?? existing[0]!.minConfirmations,
    adminReviewRequired: adminReviewRequired !== undefined ? adminReviewRequired : existing[0]!.adminReviewRequired,
    updatedAt: new Date(),
  }).where(eq(activationSettingsTable.userId, userId));

  const updated = await db.select().from(activationSettingsTable).where(eq(activationSettingsTable.userId, userId)).limit(1);
  res.json(toSettings(updated[0]!));
});

export default router;
