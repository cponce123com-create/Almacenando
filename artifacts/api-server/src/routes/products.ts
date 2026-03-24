import { Router } from "express";
import { db } from "@workspace/db";
import { productsTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { requireAuth, requireRole, type AuthenticatedRequest } from "../lib/auth.js";
import { generateId } from "../lib/id.js";
import { z } from "zod";

const router = Router();

const productSchema = z.object({
  code: z.string().min(1),
  name: z.string().min(1),
  casNumber: z.string().optional(),
  category: z.string().min(1),
  unit: z.string().min(1),
  minimumStock: z.string().default("0"),
  maximumStock: z.string().optional(),
  location: z.string().optional(),
  supplier: z.string().optional(),
  hazardClass: z.string().optional(),
  storageConditions: z.string().optional(),
  notes: z.string().optional(),
  status: z.enum(["active", "inactive"]).default("active"),
});

router.get("/", requireAuth, async (_req, res) => {
  const products = await db.select().from(productsTable).orderBy(productsTable.code);
  res.json(products);
});

router.get("/:id", requireAuth, async (req, res) => {
  const { id } = req.params;
  const products = await db.select().from(productsTable).where(eq(productsTable.id, id as string)).limit(1);
  if (products.length === 0) {
    res.status(404).json({ error: "Producto no encontrado" });
    return;
  }
  res.json(products[0]);
});

router.post("/", requireAuth, requireRole("supervisor", "admin", "operator"), async (req, res) => {
  const parsed = productSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.issues[0]?.message ?? "Datos inválidos" });
    return;
  }
  const id = generateId();
  const [created] = await db.insert(productsTable).values({ id, ...parsed.data }).returning();
  res.status(201).json(created);
});

router.put("/:id", requireAuth, requireRole("supervisor", "admin", "operator"), async (req, res) => {
  const { id } = req.params;
  const parsed = productSchema.partial().safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.issues[0]?.message ?? "Datos inválidos" });
    return;
  }
  const [updated] = await db.update(productsTable).set({ ...parsed.data, updatedAt: new Date() }).where(eq(productsTable.id, id as string)).returning();
  if (!updated) {
    res.status(404).json({ error: "Producto no encontrado" });
    return;
  }
  res.json(updated);
});

router.delete("/:id", requireAuth, requireRole("supervisor", "admin"), async (req, res) => {
  const { id } = req.params;
  const [deleted] = await db.delete(productsTable).where(eq(productsTable.id, id as string)).returning();
  if (!deleted) {
    res.status(404).json({ error: "Producto no encontrado" });
    return;
  }
  res.json({ message: "Producto eliminado" });
});

export default router;
