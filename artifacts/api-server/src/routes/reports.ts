import { Router } from "express";
import { db } from "@workspace/db";
import { productsTable, inventoryRecordsTable, immobilizedProductsTable, samplesTable, dyeLotsTable, finalDispositionTable } from "@workspace/db";
import { count, sql, and, gte, lte } from "drizzle-orm";
import { requireAuth } from "../lib/auth.js";
import { z } from "zod";

const router = Router();

export const summaryResponseSchema = z.object({
  products: z.number(),
  inventoryRecords: z.number(),
  immobilized: z.number(),
  samples: z.number(),
  dyeLots: z.number(),
  dispositions: z.number(),
});

export const inventoryReportRowSchema = z.object({
  productCode: z.string().nullable(),
  productName: z.string().nullable(),
  unit: z.string().nullable(),
  location: z.string().nullable(),
  minimumStock: z.string().nullable(),
  recordDate: z.string().nullable(),
  finalBalance: z.string().nullable(),
});

export const reportQuerySchema = z.object({
  from: z.string().optional(),
  to: z.string().optional(),
});

router.get("/summary", requireAuth, async (_req, res) => {
  const [productCount] = await db.select({ total: count() }).from(productsTable);
  const [inventoryCount] = await db.select({ total: count() }).from(inventoryRecordsTable);
  const [immobilizedCount] = await db.select({ total: count() }).from(immobilizedProductsTable);
  const [sampleCount] = await db.select({ total: count() }).from(samplesTable);
  const [dyeLotCount] = await db.select({ total: count() }).from(dyeLotsTable);
  const [dispositionCount] = await db.select({ total: count() }).from(finalDispositionTable);

  res.json({
    products: productCount?.total ?? 0,
    inventoryRecords: inventoryCount?.total ?? 0,
    immobilized: immobilizedCount?.total ?? 0,
    samples: sampleCount?.total ?? 0,
    dyeLots: dyeLotCount?.total ?? 0,
    dispositions: dispositionCount?.total ?? 0,
  });
});

router.get("/inventory", requireAuth, async (_req, res) => {
  const records = await db.select({
    productCode: productsTable.code,
    productName: productsTable.name,
    unit: productsTable.unit,
    location: productsTable.location,
    minimumStock: productsTable.minimumStock,
    recordDate: inventoryRecordsTable.recordDate,
    finalBalance: inventoryRecordsTable.finalBalance,
  }).from(inventoryRecordsTable)
    .leftJoin(productsTable, sql`${inventoryRecordsTable.productId} = ${productsTable.id}`)
    .orderBy(productsTable.code);
  res.json(records);
});

export default router;
