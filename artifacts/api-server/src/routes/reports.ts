import { Router } from "express";
import * as XLSX from "xlsx";
import { db } from "@workspace/db";
import {
  productsTable, inventoryRecordsTable, immobilizedProductsTable,
  samplesTable, finalDispositionTable, eppMasterTable, eppDeliveriesTable, personnelTable, usersTable,
  inventoryCyclesTable, inventoryCycleProductsTable,
} from "@workspace/db";
import { count, sql, and, gte, lte, eq, desc, asc, ilike, or, inArray } from "drizzle-orm";
import { requireAuth, requireRole } from "../lib/auth.js";
import { asyncHandler } from "../lib/async-handler.js";

import { z } from "zod/v4";

/**
 * Reportes
 * Reportes y exportaciones
 */

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

router.get("/summary", requireAuth, requireRole("admin", "supervisor", "quality", "operator"), asyncHandler(async (_req, res) => {
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
      const saldoSistema = Number(r.previousBalance ?? 0) || 0;
      const saldoFisico = r.physicalCount != null ? (Number(r.physicalCount) || 0) : null;
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
  } else if (type === "inventory-cycle-progress") {
    const cycleId = req.query.cycleId as string;
    if (!cycleId) { res.status(400).json({ error: "cycleId es requerido" }); return; }

    const [cycleInfo] = await db.select({
      name: inventoryCyclesTable.name,
      warehouse: inventoryCyclesTable.warehouse,
      startDate: inventoryCyclesTable.startDate,
    })
      .from(inventoryCyclesTable)
      .where(eq(inventoryCyclesTable.id, cycleId))
      .limit(1);

    if (!cycleInfo) { res.status(404).json({ error: "Ciclo no encontrado" }); return; }

    // ── Query 1: Productos del ciclo con diferencias ─────────────────────
    const cycleProducts = await db.select({
      cp: inventoryCycleProductsTable,
      product: productsTable,
    })
      .from(inventoryCycleProductsTable)
      .innerJoin(productsTable, eq(inventoryCycleProductsTable.productId, productsTable.id))
      .where(eq(inventoryCycleProductsTable.cycleId, cycleId))
      .orderBy(productsTable.code);

    const productIds = cycleProducts.map(r => r.product.id);
    const warehouse = cycleInfo.warehouse;

    // ── Query 2: Detalle de tomas (todos los registros de inventario de estos productos) ──
    const inventoryRecords = productIds.length > 0 ? await db.select({
      record: inventoryRecordsTable,
      product: productsTable,
    })
      .from(inventoryRecordsTable)
      .innerJoin(productsTable, eq(inventoryRecordsTable.productId, productsTable.id))
      .where(and(
        inArray(inventoryRecordsTable.productId, productIds),
        eq(productsTable.warehouse, warehouse)
      ))
      .orderBy(productsTable.code, asc(inventoryRecordsTable.recordDate))
      : [];

    // ── Sheet 1: Diferencias ─────────────────────────────────────────────
    const dataDiff = cycleProducts.map(r => {
      const diff = r.cp.difference;
      const statusLabels: Record<string, string> = {
        pending: "Pendiente",
        counted: "Conteado",
        verified: "Verificado",
        without_movement: "Sin Movimiento",
        skipped: "Saltado",
      };
      return {
        "Código": r.product.code,
        "Producto": r.product.name,
        "UM": r.product.unit,
        "Saldo Inicial": r.cp.initialQuantity,        // number | null
        "Conteo Físico": r.cp.physicalCount,           // number | null
        "Diferencia": diff,                              // number | null
        "Estado": statusLabels[r.cp.status] ?? r.cp.status,
        "Últ. Consumo": r.cp.initialUltimoConsumo ?? "",
        "Notas / Observaciones": r.cp.notes ?? "",
      };
    });

    // ── Sheet 2: Detalle de tomas ────────────────────────────────────────
    const dataDetail = inventoryRecords.map(r => {
      const saldoSistema = Number(r.record.previousBalance ?? 0);
      const saldoFisico = r.record.physicalCount != null ? Number(r.record.physicalCount) : null;
      const diferencia = saldoFisico != null ? saldoFisico - saldoSistema : null;
      return {
        "Código": r.product.code,
        "Producto": r.product.name,
        "UM": r.product.unit,
        "Fecha": fmtDate(r.record.recordDate),
        "Almacén": r.record.warehouse,
        "Saldo Sistema": saldoSistema,                 // number
        "Cantidad Física": saldoFisico,                // number | null
        "Diferencia": diferencia,                       // number | null
        "Ubicación": r.record.location ?? "",
        "Observaciones": r.record.notes ?? "",
      };
    });

    // ── Sheet 3: Movimiento general (todos los inventarios del almacén) ──
    const allInventoryRecords = await db.select({
      record: inventoryRecordsTable,
      product: productsTable,
    })
      .from(inventoryRecordsTable)
      .innerJoin(productsTable, eq(inventoryRecordsTable.productId, productsTable.id))
      .where(eq(productsTable.warehouse, warehouse))
      .orderBy(productsTable.code, asc(inventoryRecordsTable.recordDate));

    const dataGeneral = allInventoryRecords.map(r => {
      const saldoSistema = Number(r.record.previousBalance ?? 0);
      const saldoFisico = r.record.physicalCount != null ? Number(r.record.physicalCount) : null;
      const diferencia = saldoFisico != null ? saldoFisico - saldoSistema : null;
      return {
        "Código": r.product.code,
        "Producto": r.product.name,
        "UM": r.product.unit,
        "Fecha": fmtDate(r.record.recordDate),
        "Almacén": r.record.warehouse,
        "Saldo Sistema": saldoSistema,                 // number
        "Cantidad Física": saldoFisico,                // number | null
        "Diferencia": diferencia,                       // number | null
        "Ubicación": r.record.location ?? "",
        "Responsable": r.record.responsible ?? "",
        "Observaciones": r.record.notes ?? "",
      };
    });

    const wb = XLSX.utils.book_new();
    const ws1 = XLSX.utils.json_to_sheet(dataDiff.length > 0 ? dataDiff : [{}]);
    XLSX.utils.book_append_sheet(wb, ws1, "Diferencias");
    const ws2 = XLSX.utils.json_to_sheet(dataDetail.length > 0 ? dataDetail : [{}]);
    XLSX.utils.book_append_sheet(wb, ws2, "Detalle de Tomas");
    const ws3 = XLSX.utils.json_to_sheet(dataGeneral.length > 0 ? dataGeneral : [{}]);
    XLSX.utils.book_append_sheet(wb, ws3, "Movimiento General");
    const buf = XLSX.write(wb, { type: "buffer", bookType: "xlsx" });
    const filename = `inventario_${cycleInfo.name.replace(/[^a-zA-Z0-9]/g, "_")}_${cycleInfo.warehouse}.xlsx`;
    res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
    res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
    res.send(buf);
    return;
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

// ── Exportación consolidada multi-ciclo ────────────────────────────────────

const consolidatedCyclesSchema = z.object({
  cycleIds: z.array(z.string().min(1)).min(1),
});

router.post("/export/consolidated-cycles", requireAuth, requireRole("admin", "supervisor", "quality"), asyncHandler(async (req, res) => {
  const parsed = consolidatedCyclesSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Se requiere un array de IDs de ciclos (cycleIds)" });
    return;
  }

  const { cycleIds } = parsed.data;

  // ── Obtener info de los ciclos ──
  const cycles = await db.select()
    .from(inventoryCyclesTable)
    .where(inArray(inventoryCyclesTable.id, cycleIds))
    .orderBy(desc(inventoryCyclesTable.createdAt));

  if (cycles.length === 0) {
    res.status(404).json({ error: "No se encontraron ciclos" });
    return;
  }

  const warehouse = cycles[0].warehouse;
  const allProductIds = new Set<string>();

  // ── Obtener todos los cycle_products de estos ciclos ──
  const allCycleProducts = await db.select({
    cp: inventoryCycleProductsTable,
    product: productsTable,
    cycleName: inventoryCyclesTable.name,
  })
    .from(inventoryCycleProductsTable)
    .innerJoin(productsTable, eq(inventoryCycleProductsTable.productId, productsTable.id))
    .innerJoin(inventoryCyclesTable, eq(inventoryCycleProductsTable.cycleId, inventoryCyclesTable.id))
    .where(inArray(inventoryCycleProductsTable.cycleId, cycleIds))
    .orderBy(productsTable.code);

  for (const r of allCycleProducts) {
    allProductIds.add(r.product.id);
  }

  const productIdArray = Array.from(allProductIds);

  // ── Obtener inventory_records de estos productos ──
  const allRecords = productIdArray.length > 0 ? await db.select({
    record: inventoryRecordsTable,
    product: productsTable,
  })
    .from(inventoryRecordsTable)
    .innerJoin(productsTable, eq(inventoryRecordsTable.productId, productsTable.id))
    .where(and(
      inArray(inventoryRecordsTable.productId, productIdArray),
      eq(productsTable.warehouse, warehouse)
    ))
    .orderBy(productsTable.code, asc(inventoryRecordsTable.recordDate))
    : [];

  // ── Sheet 1: Resumen Consolidado ──
  // UNA fila por producto — datos consolidados de TODOS los ciclos seleccionados
  // Saldo Inicial = del primer ciclo donde apareció
  // Conteo Físico = del último ciclo donde se contó
  // Diferencia = ConteoFísico - SaldoInicial
  // Incluye Últ. Consumo, Días sin Mov., Meses sin Mov.

  function calcDaysSince(dateStr: string | null | undefined): number | null {
    if (!dateStr) return null;
    const d = new Date(dateStr + "T00:00:00");
    if (isNaN(d.getTime())) return null;
    return Math.floor((Date.now() - d.getTime()) / 86400000);
  }

  const statusLabels: Record<string, string> = {
    pending: "Pendiente", counted: "Conteado", verified: "Verificado",
    without_movement: "Sin Movimiento", skipped: "Saltado",
  };

  // Estado con prioridad: counted > verified > without_movement > pending > skipped
  const statusPriority: Record<string, number> = {
    counted: 5, verified: 4, without_movement: 3, pending: 2, skipped: 1,
  };

  // Agrupar por producto
  type ProductGroup = {
    code: string; productName: string; unit: string;
    firstInitialQty: number | null;
    lastPhysicalCount: number | null;
    lastUltimoConsumo: string | null;
    bestStatus: string;
  };

  const productMap = new Map<string, ProductGroup>();

  for (const r of allCycleProducts) {
    const key = r.product.id;
    if (!productMap.has(key)) {
      productMap.set(key, {
        code: r.product.code,
        productName: r.product.name,
        unit: r.product.unit,
        firstInitialQty: r.cp.initialQuantity,
        lastPhysicalCount: r.cp.physicalCount,
        lastUltimoConsumo: r.cp.initialUltimoConsumo,
        bestStatus: r.cp.status,
      });
    } else {
      const entry = productMap.get(key)!;
      // Sobrescribir solo si el ciclo actual es más reciente (cycles está DESC)
      // firstInitialQty: mantener el más antiguo (último en el array)
      // lastPhysicalCount, lastUltimoConsumo: el más reciente (primero en el array)
      // Como cycles está ordenado DESC, el index en cycles determina la antigüedad
      if (r.cp.physicalCount !== null) {
        entry.lastPhysicalCount = r.cp.physicalCount;
      }
      if (r.cp.initialUltimoConsumo !== null) {
        entry.lastUltimoConsumo = r.cp.initialUltimoConsumo;
      }
      // Mejor estado
      if ((statusPriority[r.cp.status] ?? 0) > (statusPriority[entry.bestStatus] ?? 0)) {
        entry.bestStatus = r.cp.status;
      }
      // firstInitialQty: mantener el más antiguo (el que ya tenemos, a menos que el actual sea más antiguo)
      // Como cycles está DESC, encontramos el index de este producto en el array
      const existingIsOlder = entry.firstInitialQty !== null; // ya tenemos uno
      if (!existingIsOlder && r.cp.initialQuantity !== null) {
        entry.firstInitialQty = r.cp.initialQuantity;
      }
    }
  }

  // Re-pasar para firstInitialQty: buscar el más antiguo (último en array cycles)
  // Ya que los cycles vienen DESC, el más antiguo es el último
  const oldestCycleDate = cycles[cycles.length - 1]?.startDate ?? "";
  // Para cada producto, si aparece en el ciclo más antiguo, usar su initialQuantity
  for (const r of allCycleProducts) {
    if (r.cycleName === cycles[cycles.length - 1]?.name && r.cp.initialQuantity !== null) {
      const entry = productMap.get(r.product.id);
      if (entry) {
        entry.firstInitialQty = r.cp.initialQuantity;
      }
    }
  }

  const dataConsolidated = Array.from(productMap.entries()).map(([_id, entry]) => {
    const ultimoConsumo = entry.lastUltimoConsumo;
    const daysSince = calcDaysSince(ultimoConsumo);
    const monthsSince = daysSince !== null ? Math.floor(daysSince / 30.44) : null;
    const diff = (entry.lastPhysicalCount !== null && entry.firstInitialQty !== null)
      ? entry.lastPhysicalCount - entry.firstInitialQty
      : null;

    // Determinar cuántos ciclos tiene este producto
    const cycleCount = allCycleProducts.filter(r => r.product.id === _id).length;

    return {
      "Código": entry.code,
      "Producto": entry.productName,
      "UM": entry.unit,
      "Ciclos": cycleCount,
      "Saldo Inicial": entry.firstInitialQty,        // number | null
      "Conteo Físico": entry.lastPhysicalCount,       // number | null
      "Diferencia": diff,                              // number | null (raw, sin formato)
      "Estado": statusLabels[entry.bestStatus] ?? entry.bestStatus,
      "Últ. Consumo": ultimoConsumo ?? "",
      "Días sin Mov.": daysSince,                      // number | null
      "Meses sin Mov.": monthsSince,                   // number | null
    };
  });

  // ── Sheet 2: Diferencias por Ciclo ──
  const dataDiffByCycle = allCycleProducts.map(r => {
    const diff = r.cp.difference;
    const ultimoConsumo = r.cp.initialUltimoConsumo;
    const daysSince = calcDaysSince(ultimoConsumo);
    return {
      "Ciclo": r.cycleName,
      "Código": r.product.code,
      "Producto": r.product.name,
      "UM": r.product.unit,
      "Saldo Inicial": r.cp.initialQuantity,          // number | null
      "Conteo Físico": r.cp.physicalCount,            // number | null
      "Diferencia": diff,                               // number | null
      "Estado": statusLabels[r.cp.status] ?? r.cp.status,
      "Últ. Consumo": ultimoConsumo ?? "",
      "Días sin Mov.": daysSince,                      // number | null
    };
  });

  // ── Sheet 3: Detalle de Tomas ──
  const dataDetail = allRecords.map(r => {
    const saldoSistema = Number(r.record.previousBalance ?? 0);
    const saldoFisico = r.record.physicalCount != null ? Number(r.record.physicalCount) : null;
    const diferencia = saldoFisico != null ? saldoFisico - saldoSistema : null;
    return {
      "Código": r.product.code,
      "Producto": r.product.name,
      "UM": r.product.unit,
      "Fecha": fmtDate(r.record.recordDate),
      "Almacén": r.record.warehouse,
      "Saldo Sistema": saldoSistema,                   // number
      "Cantidad Física": saldoFisico,                  // number | null
      "Diferencia": diferencia,                         // number | null
      "Ubicación": r.record.location ?? "",
      "Observaciones": r.record.notes ?? "",
    };
  });

  // ── Sheet 4: Sesiones ──
  const dataSessions = cycles.map(c => {
    const counted = allCycleProducts.filter(r =>
      r.cycleName === c.name &&
      (r.cp.status === "counted" || r.cp.status === "verified")
    );
    return {
      "Ciclo": c.name,
      "Almacén": c.warehouse,
      "Inicio": fmtDate(c.startDate),
      "Fin": fmtDate(c.endDate),
      "Total Productos": c.totalProducts,
      "Conteados": c.countedProducts,
      "Sin Movimiento": c.withoutMovement,
      "Pendientes": Math.max(0, c.totalProducts - c.countedProducts - c.withoutMovement),
    };
  });

  const wb = XLSX.utils.book_new();
  const ws1 = XLSX.utils.json_to_sheet(dataConsolidated.length > 0 ? dataConsolidated : [{}]);
  XLSX.utils.book_append_sheet(wb, ws1, "Resumen Consolidado");
  const ws2 = XLSX.utils.json_to_sheet(dataDiffByCycle.length > 0 ? dataDiffByCycle : [{}]);
  XLSX.utils.book_append_sheet(wb, ws2, "Diferencias por Ciclo");
  const ws3 = XLSX.utils.json_to_sheet(dataDetail.length > 0 ? dataDetail : [{}]);
  XLSX.utils.book_append_sheet(wb, ws3, "Detalle de Tomas");
  const ws4 = XLSX.utils.json_to_sheet(dataSessions.length > 0 ? dataSessions : [{}]);
  XLSX.utils.book_append_sheet(wb, ws4, "Sesiones");

  const buf = XLSX.write(wb, { type: "buffer", bookType: "xlsx" });
  const suffix = cycles.length === 1 ? cycles[0].name : `${cycles.length}_ciclos`;
  const filename = `inventario_consolidado_${suffix.replace(/[^a-zA-Z0-9]/g, "_")}_${warehouse}.xlsx`;

  res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
  res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
  res.send(buf);
}));

export default router;
