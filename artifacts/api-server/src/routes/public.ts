import { Router } from "express";
import { db } from "@workspace/db";
import { profilesTable, legacyItemsTable } from "@workspace/db";
import { eq } from "drizzle-orm";

const router = Router();

// Public DNI check — only returns boolean, no personal data
router.get("/legacy-check", async (req, res) => {
  const { dni } = req.query;

  if (!dni || typeof dni !== "string" || dni.trim().length < 3) {
    res.status(400).json({ error: "DNI inválido" });
    return;
  }

  const profiles = await db
    .select({ userId: profilesTable.userId })
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

export default router;
