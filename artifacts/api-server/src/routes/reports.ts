import { Router } from "express";
import * as XLSX from "xlsx";
import { db } from "@workspace/db";
import {
  productsTable, inventoryRecordsTable, immobilizedProductsTable,
  samplesTable, finalDispositionTable, eppMasterTable, eppDeliveriesTable, personnelTable, usersTable,
  inventoryCyclesTable, inventoryCycleProductsTable, inventoryBoxesTable,
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

/** Convierte string ISO a Date object (o null si está vacío) */
function toDate(d: string | null | undefined): Date | null {
  if (!d) return null;
  const dt = new Date(d + "T00:00:00");
  return isNaN(dt.getTime()) ? null : dt;
}

/** Aplica formato dd/mm/yyyy a columnas de fecha en un worksheet */
function formatDateColumns(ws: XLSX.WorkSheet, headers: string[]) {
  const ref = ws["!ref"];
  if (!ref) return;
  const range = XLSX.utils.decode_range(ref);
  if (range.s.r !== 0) return; // primera fila debe ser header
  for (const header of headers) {
    let colIdx = -1;
    for (let C = range.s.c; C <= range.e.c; C++) {
      const cell = ws[XLSX.utils.encode_cell({ r: 0, c: C })];
      if (cell && cell.v === header) { colIdx = C; break; }
    }
    if (colIdx === -1) continue;
    for (let R = range.s.r + 1; R <= range.e.r; R++) {
      const addr = XLSX.utils.encode_cell({ r: R, c: colIdx });
      const cell = ws[addr];
      if (cell && cell.t === "n") {
        cell.z = "dd/mm/yyyy";
      }
    }
  }
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
        "Últ. Consumo": toDate(r.cp.initialUltimoConsumo),
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
        "Fecha": toDate(r.record.recordDate),            // Date | null
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
        "Fecha": toDate(r.record.recordDate),            // Date | null
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
    formatDateColumns(ws1, ["Últ. Consumo"]);
    XLSX.utils.book_append_sheet(wb, ws1, "Diferencias");
    const ws2 = XLSX.utils.json_to_sheet(dataDetail.length > 0 ? dataDetail : [{}]);
    formatDateColumns(ws2, ["Fecha"]);
    XLSX.utils.book_append_sheet(wb, ws2, "Detalle de Tomas");
    const ws3 = XLSX.utils.json_to_sheet(dataGeneral.length > 0 ? dataGeneral : [{}]);
    formatDateColumns(ws3, ["Fecha"]);
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

  const allRecordIds = allRecords.map(r => r.record.id); const allBoxes = allRecordIds.length > 0 ? await db.select().from(inventoryBoxesTable) .where(inArray(inventoryBoxesTable.inventoryRecordId, allRecordIds)) .orderBy(inventoryBoxesTable.inventoryRecordId, inventoryBoxesTable.boxNumber) : []; const boxesByRecordId = new Map(); for (const box of allBoxes) { if (!boxesByRecordId.has(box.inventoryRecordId)) boxesByRecordId.set(box.inventoryRecordId, []); boxesByRecordId.get(box.inventoryRecordId).push(box); }

  // ── Sheet 1: Resumen Consolidado ──
  // UNA fila por producto — datos consolidados de TODOS los ciclos seleccionados
  // Saldo Inicial = del primer ciclo (el más antiguo)
  // Conteo Físico = del ÚLTIMO registro de inventario real (inventory_records)
  // Diferencia = ConteoFísico - SaldoInicial
  // Incluye Últ. Consumo (de balance_records), Días sin Mov., Meses sin Mov.

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

  const statusPriority: Record<string, number> = {
    counted: 5, verified: 4, without_movement: 3, pending: 2, skipped: 1,
  };

  // ── Obtener el TOTAL de physicalCount de inventory_records para cada producto ──
  // SUM en vez de latest value porque un producto puede contarse en partes
  // (ej: 470 kg + 1000 kg = 1470 kg total)
  const latestRecords = productIdArray.length > 0 ? await db.execute(sql`
    SELECT
      ir.product_id,
      SUM(COALESCE(ir.physical_count::numeric, 0)) AS total_physical
    FROM inventory_records ir
    JOIN products p ON p.id = ir.product_id
    WHERE ir.product_id IN (${sql.join(productIdArray.map(id => sql`${id}`), sql`, `)})
      AND p.warehouse = ${warehouse}
      AND ir.physical_count IS NOT NULL
    GROUP BY ir.product_id
  `) : { rows: [] };

  const latestPhysicalMap = new Map<string, number>();
  for (const row of (latestRecords.rows as { product_id: string; total_physical: number }[])) {
    if (!latestPhysicalMap.has(row.product_id)) {
      latestPhysicalMap.set(row.product_id, Number(row.total_physical));
    }
  }

  // ── Obtener el ÚLTIMO ultimo_consumo de balance_records para cada producto ──
  const latestBalances = productIdArray.length > 0 ? await db.execute(sql`
    SELECT DISTINCT ON (br.code)
      br.code, br.ultimo_consumo
    FROM balance_records br
    WHERE br.warehouse = ${warehouse}
      AND br.ultimo_consumo IS NOT NULL
      AND br.ultimo_consumo > '2013-01-01'
    ORDER BY br.code, br.balance_date DESC, br.created_at DESC
  `) : { rows: [] };

  const latestBalanceUltimoConsumo = new Map<string, string>();
  for (const row of (latestBalances.rows as { code: string; ultimo_consumo: string }[])) {
    if (!latestBalanceUltimoConsumo.has(row.code)) {
      latestBalanceUltimoConsumo.set(row.code, row.ultimo_consumo);
    }
  }

  // ── Primera initialQuantity por producto (del ciclo más antiguo donde aparezca) ──
  // cycles está ordenado DESC, el más antiguo es el último
  const oldestCycle = cycles[cycles.length - 1];
  const oldestCycleProductIds = new Set(
    allCycleProducts
      .filter(r => r.cycleName === oldestCycle?.name && r.cp.initialQuantity !== null)
      .map(r => r.product.id)
  );

  const firstInitialQtyMap = new Map<string, number>();
  for (const r of allCycleProducts) {
    if (r.cp.initialQuantity !== null && !firstInitialQtyMap.has(r.product.id)) {
      firstInitialQtyMap.set(r.product.id, r.cp.initialQuantity);
    }
  }
  // Forzar el del ciclo más antiguo si existe
  for (const r of allCycleProducts) {
    if (r.cycleName === oldestCycle?.name && r.cp.initialQuantity !== null) {
      firstInitialQtyMap.set(r.product.id, r.cp.initialQuantity);
    }
  }

  // ── Mejor estado por producto (de todos los ciclos) ──
  const bestStatusMap = new Map<string, string>();
  for (const r of allCycleProducts) {
    const current = bestStatusMap.get(r.product.id);
    if (!current || (statusPriority[r.cp.status] ?? 0) > (statusPriority[current] ?? 0)) {
      bestStatusMap.set(r.product.id, r.cp.status);
    }
  }

  // ── Construir el consolidado ──
  // Mapa de producto.id → datos básicos (code, name, unit, productName)
  const productInfoMap = new Map<string, { code: string; productName: string; unit: string }>();
  for (const r of allCycleProducts) {
    if (!productInfoMap.has(r.product.id)) {
      productInfoMap.set(r.product.id, {
        code: r.product.code,
        productName: r.product.name,
        unit: r.product.unit,
      });
    }
  }

  const dataConsolidated = Array.from(productInfoMap.entries()).map(([productId, info]) => {
    const firstInitialQty = firstInitialQtyMap.get(productId) ?? null;
    const lastPhysicalCount = latestPhysicalMap.get(productId) ?? null;
    const ultimoConsumo = latestBalanceUltimoConsumo.get(info.code) ?? null;
    const daysSince = calcDaysSince(ultimoConsumo);
    const monthsSince = daysSince !== null ? Math.floor(daysSince / 30.44) : null;
    const diff = (lastPhysicalCount !== null && firstInitialQty !== null)
      ? lastPhysicalCount - firstInitialQty
      : null;
    const bestStatus = bestStatusMap.get(productId) ?? "pending";
    const cycleCount = allCycleProducts.filter(r => r.product.id === productId).length;

    return {
      "Código": info.code,
      "Producto": info.productName,
      "UM": info.unit,
      "Ciclos": cycleCount,
      "Saldo Inicial": firstInitialQty,                 // number | null
      "Conteo Físico": lastPhysicalCount,               // number | null (del inventory_records REAL)
      "Diferencia": diff,                                // number | null
      "Estado": statusLabels[bestStatus] ?? bestStatus,
      "Últ. Consumo": toDate(ultimoConsumo),            // Date | null
      "Días sin Mov.": daysSince,                        // number | null
      "Meses sin Mov.": monthsSince,                     // number | null
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
      "Últ. Consumo": toDate(ultimoConsumo),               // Date | null
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
      "Fecha": toDate(r.record.recordDate),            // Date | null
      "Almacén": r.record.warehouse,
      "Saldo Sistema": saldoSistema,                   // number
      "Cantidad Física": saldoFisico,                  // number | null
      "Diferencia": diferencia,                         // number | null
      "Peso Bruto": (() => { const boxes = boxesByRecordId.get(r.record.id) || []; const total = boxes.reduce((s, b) => s + (Number(b.weight) || 0), 0); return total > 0 ? total : null; })(),
      "Tara": (() => { const boxes = boxesByRecordId.get(r.record.id) || []; const total = boxes.reduce((s, b) => s + (Number(b.tare) || 0), 0); return total > 0 ? total : null; })(),
      "Peso Neto": (() => { const boxes = boxesByRecordId.get(r.record.id) || []; const gross = boxes.reduce((s, b) => s + (Number(b.weight) || 0), 0); const tare = boxes.reduce((s, b) => s + (Number(b.tare) || 0), 0); return (gross - tare) > 0 ? Math.round((gross - tare) * 1000) / 1000 : null; })(),
      "Falta Etiqueta": r.record.missingLabel ? "Sí" : "No",
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
      "Inicio": toDate(c.startDate),
      "Fin": toDate(c.endDate),
      "Total Productos": c.totalProducts,
      "Conteados": c.countedProducts,
      "Sin Movimiento": c.withoutMovement,
      "Pendientes": Math.max(0, c.totalProducts - c.countedProducts - c.withoutMovement),
    };
  });

  const wb = XLSX.utils.book_new();
  const ws1 = XLSX.utils.json_to_sheet(dataConsolidated.length > 0 ? dataConsolidated : [{}]);
  formatDateColumns(ws1, ["Últ. Consumo"]);
  XLSX.utils.book_append_sheet(wb, ws1, "Resumen Consolidado");
  const ws2 = XLSX.utils.json_to_sheet(dataDiffByCycle.length > 0 ? dataDiffByCycle : [{}]);
  formatDateColumns(ws2, ["Últ. Consumo"]);
  XLSX.utils.book_append_sheet(wb, ws2, "Diferencias por Ciclo");
  const ws3 = XLSX.utils.json_to_sheet(dataDetail.length > 0 ? dataDetail : [{}]);
  formatDateColumns(ws3, ["Fecha"]);
  XLSX.utils.book_append_sheet(wb, ws3, "Detalle de Tomas");
  const ws4 = XLSX.utils.json_to_sheet(dataSessions.length > 0 ? dataSessions : [{}]);
  formatDateColumns(ws4, ["Inicio", "Fin"]);
  XLSX.utils.book_append_sheet(wb, ws4, "Sesiones");

  const buf = XLSX.write(wb, { type: "buffer", bookType: "xlsx" });
  const suffix = cycles.length === 1 ? cycles[0].name : `${cycles.length}_ciclos`;
  const filename = `inventario_consolidado_${suffix.replace(/[^a-zA-Z0-9]/g, "_")}_${warehouse}.xlsx`;

  res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
  res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
  res.send(buf);
}));

export default router;
