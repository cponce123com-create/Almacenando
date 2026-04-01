import { Router } from "express";
import * as XLSX from "xlsx";
import { db } from "@workspace/db";
import {
  productsTable, inventoryRecordsTable, immobilizedProductsTable,
  samplesTable, finalDispositionTable, eppMasterTable, eppDeliveriesTable, personnelTable, usersTable,
} from "@workspace/db";
import { count, sql, and, gte, lte, eq, desc, ilike, or } from "drizzle-orm";
import { requireAuth, requireRole } from "../lib/auth.js";
import { asyncHandler } from "../lib/async-handler.js";

const router = Router();

function fmtDate(d: string | null | undefined): string {
  if (!d) return "";
  const parts = d.split("T")[0].split("-");
  if (parts.length !== 3) return d;
  return `${parts[2]}/${parts[1]}/${parts[0]}`;
}

function buildDateFilter(col: unknown, from?: string, to?: string) {
  const filters = [];
  if (from) filters.push(gte(col as Parameters<typeof gte>[0], from));
  if (to) filters.push(lte(col as Parameters<typeof lte>[0], to));
  return filters.length > 0 ? and(...filters) : undefined;
}

router.get("/summary", requireAuth, asyncHandler(async (_req, res) => {
  const [productCount] = await db.select({ total: count() }).from(productsTable);
  const [inventoryCount] = await db.select({ total: count() }).from(inventoryRecordsTable);
  const [immobilizedCount] = await db.select({ total: count() }).from(immobilizedProductsTable);
  const [sampleCount] = await db.select({ total: count() }).from(samplesTable);
  const [dispositionCount] = await db.select({ total: count() }).from(finalDispositionTable);
  const activeImmobilized = await db.select({ total: count() }).from(immobilizedProductsTable).where(eq(immobilizedProductsTable.status, "immobilized"));
  res.json({
    products: productCount?.total ?? 0,
    inventoryRecords: inventoryCount?.total ?? 0,
    immobilized: immobilizedCount?.total ?? 0,
    activeImmobilized: activeImmobilized[0]?.total ?? 0,
    samples: sampleCount?.total ?? 0,
    dispositions: dispositionCount?.total ?? 0,
  });
}));

router.get("/inventory", requireAuth, asyncHandler(async (req, res) => {
  const { from, to, product } = req.query as Record<string, string | undefined>;
  const dateFilter = buildDateFilter(inventoryRecordsTable.recordDate, from, to);
  const productFilter = product
    ? or(ilike(productsTable.code, `%${product}%`), ilike(productsTable.name, `%${product}%`))
    : undefined;
  const records = await db.select({
    productId: inventoryRecordsTable.productId,
    productCode: productsTable.code,
    productName: productsTable.name,
    unit: productsTable.unit,
    recordDate: inventoryRecordsTable.recordDate,
    previousBalance: inventoryRecordsTable.previousBalance,
    physicalCount: inventoryRecordsTable.physicalCount,
    inputs: inventoryRecordsTable.inputs,
    outputs: inventoryRecordsTable.outputs,
    finalBalance: inventoryRecordsTable.finalBalance,
    notes: inventoryRecordsTable.notes,
    registeredByName: usersTable.name,
    registeredByEmail: usersTable.email,
  }).from(inventoryRecordsTable)
    .innerJoin(productsTable, sql`${inventoryRecordsTable.productId} = ${productsTable.id}`)
    .leftJoin(usersTable, sql`${inventoryRecordsTable.registeredBy} = ${usersTable.id}`)
    .where(and(dateFilter, productFilter))
    .orderBy(desc(inventoryRecordsTable.recordDate), productsTable.code);

  // Last consumption date per product
  const lcRows = await db.execute(sql`
    SELECT ir.product_id, MAX(ir.record_date) AS last_consumption_date
    FROM inventory_records ir
    GROUP BY ir.product_id
  `);
  const lcMap = new Map<string, string>();
  for (const row of lcRows.rows as { product_id: string; last_consumption_date: string | null }[]) {
    if (row.last_consumption_date) lcMap.set(row.product_id, row.last_consumption_date);
  }

  res.json(records.map(r => ({
    ...r,
    lastConsumptionDate: r.productId ? (lcMap.get(r.productId) ?? null) : null,
    operario: r.registeredByName ?? r.registeredByEmail ?? "",
  })));
}));

router.get("/immobilized", requireAuth, asyncHandler(async (req, res) => {
  const { from, to, status } = req.query as Record<string, string | undefined>;
  const dateFilter = buildDateFilter(immobilizedProductsTable.immobilizedDate, from, to);
  const statusFilter = status ? eq(immobilizedProductsTable.status, status) : undefined;
  const records = await db.select({
    id: immobilizedProductsTable.id,
    productId: immobilizedProductsTable.productId,
    productCode: productsTable.code,
    productName: productsTable.name,
    quantity: immobilizedProductsTable.quantity,
    reason: immobilizedProductsTable.reason,
    status: immobilizedProductsTable.status,
    immobilizedDate: immobilizedProductsTable.immobilizedDate,
    releasedAt: immobilizedProductsTable.releasedAt,
    notes: immobilizedProductsTable.notes,
    photos: immobilizedProductsTable.photos,
  }).from(immobilizedProductsTable)
    .leftJoin(productsTable, sql`${immobilizedProductsTable.productId} = ${productsTable.id}`)
    .where(and(dateFilter, statusFilter))
    .orderBy(desc(immobilizedProductsTable.immobilizedDate));

  res.json(records);
}));

router.get("/samples", requireAuth, asyncHandler(async (req, res) => {
  const { from, to, status } = req.query as Record<string, string | undefined>;
  const dateFilter = buildDateFilter(samplesTable.sampleDate, from, to);
  const statusFilter = status ? eq(samplesTable.status, status) : undefined;
  const records = await db.select().from(samplesTable)
    .where(and(dateFilter, statusFilter))
    .orderBy(desc(samplesTable.sampleDate));
  res.json(records);
}));

router.get("/disposition", requireAuth, asyncHandler(async (req, res) => {
  const { from, to, status } = req.query as Record<string, string | undefined>;
  const dateFilter = buildDateFilter(finalDispositionTable.dispositionDate, from, to);
  const statusFilter = status ? eq(finalDispositionTable.status, status) : undefined;
  const records = await db.select({
    id: finalDispositionTable.id,
    productId: finalDispositionTable.productId,
    productCode: productsTable.code,
    productName: productsTable.name,
    productNameManual: finalDispositionTable.productNameManual,
    quantity: finalDispositionTable.quantity,
    unit: finalDispositionTable.unit,
    dispositionType: finalDispositionTable.dispositionType,
    dispositionDate: finalDispositionTable.dispositionDate,
    contractor: finalDispositionTable.contractor,
    manifestNumber: finalDispositionTable.manifestNumber,
    status: finalDispositionTable.status,
    cost: finalDispositionTable.cost,
    notes: finalDispositionTable.notes,
  }).from(finalDispositionTable)
    .leftJoin(productsTable, sql`${finalDispositionTable.productId} = ${productsTable.id}`)
    .where(and(dateFilter, statusFilter))
    .orderBy(desc(finalDispositionTable.dispositionDate));

  res.json(records.map(r => ({
    ...r,
    productDisplayName: r.productName ?? r.productNameManual ?? "—",
  })));
}));

router.get("/epp-deliveries", requireAuth, asyncHandler(async (req, res) => {
  const { from, to, personnelId } = req.query as Record<string, string | undefined>;
  const dateFilter = buildDateFilter(eppDeliveriesTable.deliveryDate, from, to);
  const personnelFilter = personnelId ? eq(eppDeliveriesTable.personnelId, personnelId) : undefined;
  const records = await db.select({
    id: eppDeliveriesTable.id,
    eppId: eppDeliveriesTable.eppId,
    eppCode: eppMasterTable.code,
    eppName: eppMasterTable.name,
    eppCategory: eppMasterTable.category,
    replacementPeriodDays: eppMasterTable.replacementPeriodDays,
    personnelId: eppDeliveriesTable.personnelId,
    personnelName: personnelTable.name,
    personnelDepartment: personnelTable.department,
    deliveryDate: eppDeliveriesTable.deliveryDate,
    quantity: eppDeliveriesTable.quantity,
    condition: eppDeliveriesTable.condition,
    notes: eppDeliveriesTable.notes,
  }).from(eppDeliveriesTable)
    .leftJoin(eppMasterTable, sql`${eppDeliveriesTable.eppId} = ${eppMasterTable.id}`)
    .leftJoin(personnelTable, sql`${eppDeliveriesTable.personnelId} = ${personnelTable.id}`)
    .where(and(dateFilter, personnelFilter))
    .orderBy(desc(eppDeliveriesTable.deliveryDate));

  const filtered = records;

  const today = new Date();
  const withAlerts = filtered.map(r => {
    let nextReplacementDate: string | null = null;
    let daysUntilReplacement: number | null = null;
    let alertLevel: "ok" | "soon" | "due" | "overdue" = "ok";
    if (r.replacementPeriodDays && r.deliveryDate) {
      const delivery = new Date(r.deliveryDate);
      const next = new Date(delivery);
      next.setDate(next.getDate() + r.replacementPeriodDays);
      nextReplacementDate = next.toISOString().slice(0, 10);
      daysUntilReplacement = Math.ceil((next.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
      if (daysUntilReplacement < 0) alertLevel = "overdue";
      else if (daysUntilReplacement <= 15) alertLevel = "due";
      else if (daysUntilReplacement <= 30) alertLevel = "soon";
    }
    return { ...r, nextReplacementDate, daysUntilReplacement, alertLevel };
  });
  res.json(withAlerts);
}));

router.get("/epp-alerts", requireAuth, requireRole("admin", "supervisor", "quality"), asyncHandler(async (_req, res) => {
  const records = await db.select({
    id: eppDeliveriesTable.id,
    eppId: eppDeliveriesTable.eppId,
    eppCode: eppMasterTable.code,
    eppName: eppMasterTable.name,
    replacementPeriodDays: eppMasterTable.replacementPeriodDays,
    personnelId: eppDeliveriesTable.personnelId,
    personnelName: personnelTable.name,
    deliveryDate: eppDeliveriesTable.deliveryDate,
  }).from(eppDeliveriesTable)
    .leftJoin(eppMasterTable, sql`${eppDeliveriesTable.eppId} = ${eppMasterTable.id}`)
    .leftJoin(personnelTable, sql`${eppDeliveriesTable.personnelId} = ${personnelTable.id}`)
    .orderBy(desc(eppDeliveriesTable.deliveryDate));

  const today = new Date();
  const alerts = records
    .filter(r => r.replacementPeriodDays && r.deliveryDate)
    .map(r => {
      const delivery = new Date(r.deliveryDate!);
      const next = new Date(delivery);
      next.setDate(next.getDate() + r.replacementPeriodDays!);
      const daysUntil = Math.ceil((next.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
      let alertLevel: "soon" | "due" | "overdue" = "soon";
      if (daysUntil < 0) alertLevel = "overdue";
      else if (daysUntil <= 15) alertLevel = "due";
      return {
        ...r,
        nextReplacementDate: next.toISOString().slice(0, 10),
        daysUntilReplacement: daysUntil,
        alertLevel,
      };
    })
    .filter(r => r.daysUntilReplacement <= 30)
    .sort((a, b) => a.daysUntilReplacement - b.daysUntilReplacement);

  res.json(alerts);
}));

router.get("/export/:type", requireAuth, requireRole("admin", "supervisor", "quality"), asyncHandler(async (req, res) => {
  const { type } = req.params;
  const { from, to, status, personnelId } = req.query as Record<string, string | undefined>;

  const buildUrl = (path: string, params: Record<string, string | undefined>) => {
    const q = new URLSearchParams();
    for (const [k, v] of Object.entries(params)) if (v) q.set(k, v);
    return `${path}?${q.toString()}`;
  };

  let data: unknown[] = [];
  let sheetName = "Reporte";

  if (type === "inventory") {
    const records = await db.select({
      productId: inventoryRecordsTable.productId,
      productCode: productsTable.code,
      productName: productsTable.name,
      recordDate: inventoryRecordsTable.recordDate,
      previousBalance: inventoryRecordsTable.previousBalance,
      physicalCount: inventoryRecordsTable.physicalCount,
      inputs: inventoryRecordsTable.inputs,
      outputs: inventoryRecordsTable.outputs,
      finalBalance: inventoryRecordsTable.finalBalance,
      registeredBy: inventoryRecordsTable.registeredBy,
      registeredByName: usersTable.name,
      registeredByEmail: usersTable.email,
    }).from(inventoryRecordsTable)
      .innerJoin(productsTable, sql`${inventoryRecordsTable.productId} = ${productsTable.id}`)
      .leftJoin(usersTable, sql`${inventoryRecordsTable.registeredBy} = ${usersTable.id}`)
      .orderBy(desc(inventoryRecordsTable.recordDate));

    // Last consumption date per product (most recent inventory record date)
    const lcRows = await db.execute(sql`
      SELECT ir.product_id, MAX(ir.record_date) AS last_consumption_date
      FROM inventory_records ir
      GROUP BY ir.product_id
    `);
    const lcMapRep = new Map<string, string>();
    for (const row of lcRows.rows as { product_id: string; last_consumption_date: string | null }[]) {
      if (row.last_consumption_date) lcMapRep.set(row.product_id, row.last_consumption_date);
    }
    data = records.map(r => {
      const saldoSistema = parseFloat(r.previousBalance ?? "0") || 0;
      const saldoFisico = r.physicalCount != null ? (parseFloat(r.physicalCount) || 0) : null;
      const diferencia = saldoFisico != null ? saldoFisico - saldoSistema : null;
      const operario = r.registeredByName ?? r.registeredByEmail ?? r.registeredBy ?? "";
      let estado = "";
      if (saldoFisico != null) {
        if (Math.abs(diferencia ?? 0) < 0.001) estado = "Cuadrado";
        else if ((diferencia ?? 0) > 0) estado = "Sobrante";
        else estado = "Faltante";
      }
      return {
        "Código": r.productCode,
        "Producto": r.productName,
        "Fecha": fmtDate(r.recordDate),
        "Saldo Sistema": saldoSistema,
        "Saldo Físico": saldoFisico ?? "",
        "Diferencia": diferencia ?? "",
        "Estado": estado,
        "Últ. Consumo": r.productId ? fmtDate(lcMapRep.get(r.productId)) : "",
        "Operario": operario,
      };
    });
    sheetName = "Inventario";
  } else if (type === "immobilized") {
    const records = await db.select({
      productCode: productsTable.code, productName: productsTable.name,
      quantity: immobilizedProductsTable.quantity, reason: immobilizedProductsTable.reason,
      status: immobilizedProductsTable.status, immobilizedDate: immobilizedProductsTable.immobilizedDate,
      photos: immobilizedProductsTable.photos,
    }).from(immobilizedProductsTable)
      .leftJoin(productsTable, sql`${immobilizedProductsTable.productId} = ${productsTable.id}`)
      .orderBy(desc(immobilizedProductsTable.immobilizedDate));
    data = records.map(r => {
      const photos = (r.photos as string[] | null) ?? [];
      return {
        "Código": r.productCode, "Producto": r.productName, "Cantidad": r.quantity,
        "Motivo": r.reason, "Estado": r.status, "Fecha Inmovilización": fmtDate(r.immobilizedDate),
        "Foto 1": photos[0] ?? "", "Foto 2": photos[1] ?? "",
        "Foto 3": photos[2] ?? "", "Foto 4": photos[3] ?? "", "Foto 5": photos[4] ?? "",
      };
    });
    sheetName = "Inmovilizados";
  } else if (type === "samples") {
    const records = await db.select().from(samplesTable).orderBy(desc(samplesTable.sampleDate));
    data = records.map(r => {
      const photos = (r.photos as string[] | null) ?? [];
      return {
        "Código Muestra": r.sampleCode, "Producto": r.productName ?? r.productId,
        "Proveedor": r.supplier, "Cantidad": r.quantity, "Unidad": r.unit,
        "Fecha": fmtDate(r.sampleDate), "Propósito": r.purpose, "Estado": r.status,
        "Lab. Referencia": r.labReference, "Resultado": r.result,
        "Foto 1": photos[0] ?? "", "Foto 2": photos[1] ?? "",
        "Foto 3": photos[2] ?? "", "Foto 4": photos[3] ?? "", "Foto 5": photos[4] ?? "",
      };
    });
    sheetName = "Muestras";
  } else if (type === "disposition") {
    const records = await db.select({
      productName: productsTable.name, productNameManual: finalDispositionTable.productNameManual,
      quantity: finalDispositionTable.quantity, unit: finalDispositionTable.unit,
      dispositionType: finalDispositionTable.dispositionType,
      dispositionDate: finalDispositionTable.dispositionDate,
      contractor: finalDispositionTable.contractor, manifestNumber: finalDispositionTable.manifestNumber,
      status: finalDispositionTable.status, cost: finalDispositionTable.cost,
      photos: finalDispositionTable.photos,
    }).from(finalDispositionTable)
      .leftJoin(productsTable, sql`${finalDispositionTable.productId} = ${productsTable.id}`)
      .orderBy(desc(finalDispositionTable.dispositionDate));
    data = records.map(r => {
      const photos = (r.photos as string[] | null) ?? [];
      return {
        "Producto": r.productName ?? r.productNameManual, "Cantidad": r.quantity, "Unidad": r.unit,
        "Tipo Disposición": r.dispositionType, "Fecha": fmtDate(r.dispositionDate),
        "Empresa": r.contractor, "Manifiesto": r.manifestNumber,
        "Estado": r.status, "Costo": r.cost,
        "Foto 1": photos[0] ?? "", "Foto 2": photos[1] ?? "",
        "Foto 3": photos[2] ?? "", "Foto 4": photos[3] ?? "", "Foto 5": photos[4] ?? "",
      };
    });
    sheetName = "Disposición Final";
  } else if (type === "epp") {
    const records = await db.select({
      eppCode: eppMasterTable.code, eppName: eppMasterTable.name,
      personnelName: personnelTable.name, deliveryDate: eppDeliveriesTable.deliveryDate,
      quantity: eppDeliveriesTable.quantity, condition: eppDeliveriesTable.condition,
      replacementPeriodDays: eppMasterTable.replacementPeriodDays,
    }).from(eppDeliveriesTable)
      .leftJoin(eppMasterTable, sql`${eppDeliveriesTable.eppId} = ${eppMasterTable.id}`)
      .leftJoin(personnelTable, sql`${eppDeliveriesTable.personnelId} = ${personnelTable.id}`)
      .orderBy(desc(eppDeliveriesTable.deliveryDate));
    const today2 = new Date();
    data = records.map(r => {
      let nextReplacement = "";
      if (r.replacementPeriodDays && r.deliveryDate) {
        const d = new Date(r.deliveryDate);
        d.setDate(d.getDate() + r.replacementPeriodDays);
        nextReplacement = d.toISOString().slice(0, 10);
      }
      return {
        "Código EPP": r.eppCode, "Nombre EPP": r.eppName, "Operario": r.personnelName,
        "Fecha Entrega": fmtDate(r.deliveryDate), "Cantidad": r.quantity, "Condición": r.condition,
        "Período Reposición (días)": r.replacementPeriodDays, "Próxima Reposición": fmtDate(nextReplacement),
      };
    });
    sheetName = "Entregas EPP";
  } else {
    res.status(400).json({ error: "Tipo de reporte no válido" });
    return;
  }

  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.json_to_sheet(data.length > 0 ? data : [{}]);
  XLSX.utils.book_append_sheet(wb, ws, sheetName);
  const buf = XLSX.write(wb, { type: "buffer", bookType: "xlsx" });
  res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
  res.setHeader("Content-Disposition", `attachment; filename="reporte_${type}.xlsx"`);
  res.send(buf);
}));

export default router;
