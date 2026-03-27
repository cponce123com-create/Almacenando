import { db } from "@workspace/db";
import {
  usersTable,
  productsTable,
  inventoryRecordsTable,
  inventoryBoxesTable,
  immobilizedProductsTable,
  samplesTable,
  dyeLotsTable,
  finalDispositionTable,
  personnelTable,
  eppMasterTable,
} from "@workspace/db";
import { eq, inArray, like } from "drizzle-orm";
import { hashPassword } from "./auth.js";
import { generateId } from "./id.js";
import { logger } from "./logger.js";

const chemicalProducts = [
  { code: "PROD-001", name: "Ácido Sulfúrico 98%", casNumber: "7664-93-9", category: "Ácido", unit: "L", minimumStock: "50", maximumStock: "250", location: "A-01", supplier: "QuimPeru SAC", hazardClass: "Corrosivo", storageConditions: "Área ventilada, lejos de bases" },
  { code: "PROD-002", name: "Hidróxido de Sodio (Soda Cáustica)", casNumber: "1310-73-2", category: "Base", unit: "kg", minimumStock: "100", maximumStock: "500", location: "A-02", supplier: "QuimPeru SAC", hazardClass: "Corrosivo", storageConditions: "Seco, lejos de ácidos y agua" },
  { code: "PROD-003", name: "Acetona", casNumber: "67-64-1", category: "Solvente", unit: "L", minimumStock: "30", maximumStock: "150", location: "B-01", supplier: "Distrosolv EIRL", hazardClass: "Inflamable", storageConditions: "Lejos de fuentes de ignición" },
  { code: "PROD-004", name: "Etanol 96%", casNumber: "64-17-5", category: "Solvente", unit: "L", minimumStock: "50", maximumStock: "250", location: "B-02", supplier: "Distrosolv EIRL", hazardClass: "Inflamable", storageConditions: "Área fresca y ventilada" },
  { code: "PROD-005", name: "Ácido Clorhídrico 37%", casNumber: "7647-01-0", category: "Ácido", unit: "L", minimumStock: "40", maximumStock: "200", location: "A-03", supplier: "QuimPeru SAC", hazardClass: "Corrosivo", storageConditions: "Lejos de metales y bases" },
  { code: "PROD-006", name: "Tolueno", casNumber: "108-88-3", category: "Solvente", unit: "L", minimumStock: "20", maximumStock: "100", location: "B-03", supplier: "Distrosolv EIRL", hazardClass: "Inflamable/Tóxico", storageConditions: "Área ventilada, lejos de calor" },
  { code: "PROD-007", name: "Peróxido de Hidrógeno 30%", casNumber: "7722-84-1", category: "Oxidante", unit: "L", minimumStock: "25", maximumStock: "125", location: "C-01", supplier: "OxiPeru SAC", hazardClass: "Oxidante", storageConditions: "Lugar fresco, lejos de combustibles" },
  { code: "PROD-008", name: "Cloruro de Metileno", casNumber: "75-09-2", category: "Solvente", unit: "L", minimumStock: "15", maximumStock: "75", location: "B-04", supplier: "Distrosolv EIRL", hazardClass: "Tóxico", storageConditions: "Lugar fresco, bien ventilado" },
  { code: "PROD-009", name: "Nitrato de Plata", casNumber: "7761-88-8", category: "Reactivo", unit: "g", minimumStock: "500", maximumStock: "2500", location: "D-01", supplier: "ReacLab SRL", hazardClass: "Oxidante/Corrosivo", storageConditions: "Recipiente oscuro, lejos de materia orgánica" },
  { code: "PROD-010", name: "Sulfato de Cobre Pentahidratado", casNumber: "7758-99-8", category: "Reactivo", unit: "kg", minimumStock: "10", maximumStock: "50", location: "D-02", supplier: "ReacLab SRL", hazardClass: "Nocivo", storageConditions: "Seco, lejos de metales" },
  { code: "PROD-011", name: "Ácido Nítrico 65%", casNumber: "7697-37-2", category: "Ácido", unit: "L", minimumStock: "30", maximumStock: "150", location: "A-04", supplier: "QuimPeru SAC", hazardClass: "Corrosivo/Oxidante", storageConditions: "Área ventilada, lejos de materiales orgánicos" },
  { code: "PROD-012", name: "Metanol", casNumber: "67-56-1", category: "Solvente", unit: "L", minimumStock: "40", maximumStock: "200", location: "B-05", supplier: "Distrosolv EIRL", hazardClass: "Inflamable/Tóxico", storageConditions: "Lejos de fuentes de ignición" },
  { code: "PROD-013", name: "Cloruro de Sodio (Sal)", casNumber: "7647-14-5", category: "Reactivo", unit: "kg", minimumStock: "50", maximumStock: "250", location: "D-03", supplier: "ReacLab SRL", hazardClass: "No peligroso", storageConditions: "Lugar seco" },
  { code: "PROD-014", name: "Hexano", casNumber: "110-54-3", category: "Solvente", unit: "L", minimumStock: "20", maximumStock: "100", location: "B-06", supplier: "Distrosolv EIRL", hazardClass: "Inflamable/Tóxico", storageConditions: "Lejos de calor e ignición" },
  { code: "PROD-015", name: "Hidróxido de Potasio", casNumber: "1310-58-3", category: "Base", unit: "kg", minimumStock: "25", maximumStock: "125", location: "A-05", supplier: "QuimPeru SAC", hazardClass: "Corrosivo", storageConditions: "Seco, lejos de ácidos" },
  { code: "PROD-016", name: "Permanganato de Potasio", casNumber: "7722-64-7", category: "Oxidante", unit: "kg", minimumStock: "10", maximumStock: "50", location: "C-02", supplier: "OxiPeru SAC", hazardClass: "Oxidante", storageConditions: "Lejos de materiales combustibles" },
  { code: "PROD-017", name: "Dicromato de Potasio", casNumber: "7778-50-9", category: "Reactivo", unit: "kg", minimumStock: "5", maximumStock: "25", location: "D-04", supplier: "ReacLab SRL", hazardClass: "Tóxico/Oxidante", storageConditions: "Lejos de materiales orgánicos" },
  { code: "PROD-018", name: "Ácido Acético Glacial", casNumber: "64-19-7", category: "Ácido", unit: "L", minimumStock: "30", maximumStock: "150", location: "A-06", supplier: "QuimPeru SAC", hazardClass: "Inflamable/Corrosivo", storageConditions: "Lugar fresco y ventilado" },
  { code: "PROD-019", name: "Xileno", casNumber: "1330-20-7", category: "Solvente", unit: "L", minimumStock: "25", maximumStock: "125", location: "B-07", supplier: "Distrosolv EIRL", hazardClass: "Inflamable/Tóxico", storageConditions: "Lejos de calor e ignición" },
  { code: "PROD-020", name: "Cloroformo", casNumber: "67-66-3", category: "Solvente", unit: "L", minimumStock: "10", maximumStock: "50", location: "B-08", supplier: "Distrosolv EIRL", hazardClass: "Tóxico", storageConditions: "Lugar oscuro y ventilado" },
];

const demoUsers = [
  { email: "supervisor@almacen.com", name: "Carlos Mendoza", role: "supervisor" as const, password: "Almacen2024!" },
  { email: "operario@almacen.com", name: "María Quispe", role: "operator" as const, password: "Almacen2024!" },
  { email: "calidad@almacen.com", name: "Luis Torres", role: "quality" as const, password: "Almacen2024!" },
  { email: "admin@almacen.com", name: "Ana García", role: "admin" as const, password: "Almacen2024!" },
  { email: "consulta@almacen.com", name: "Pedro Vargas", role: "readonly" as const, password: "Almacen2024!" },
];

const demoPersonnel = [
  { employeeId: "EMP-001", name: "Roberto Silva", position: "Operario de Almacén", department: "Almacén", email: "r.silva@almacen.com", hireDate: "2022-03-15" },
  { employeeId: "EMP-002", name: "Carmen López", position: "Técnica de Calidad", department: "Control de Calidad", email: "c.lopez@almacen.com", hireDate: "2021-07-01" },
  { employeeId: "EMP-003", name: "Jorge Ramírez", position: "Supervisor", department: "Almacén", email: "j.ramirez@almacen.com", hireDate: "2020-01-15" },
  { employeeId: "EMP-004", name: "Sandra Flores", position: "Asistente Administrativa", department: "Administración", email: "s.flores@almacen.com", hireDate: "2023-02-01" },
];

const demoEpp = [
  { code: "EPP-001", name: "Casco de Seguridad", category: "Protección de cabeza", standardReference: "ANSI Z89.1", replacementPeriodDays: 1825 },
  { code: "EPP-002", name: "Guantes de Nitrilo", category: "Protección de manos", standardReference: "EN 374", replacementPeriodDays: 30 },
  { code: "EPP-003", name: "Lentes de Seguridad", category: "Protección visual", standardReference: "ANSI Z87.1", replacementPeriodDays: 365 },
  { code: "EPP-004", name: "Respirador con Filtro Químico", category: "Protección respiratoria", standardReference: "NIOSH 42 CFR 84", replacementPeriodDays: 90 },
  { code: "EPP-005", name: "Bata de Laboratorio", category: "Protección corporal", standardReference: "EN 13034", replacementPeriodDays: 365 },
  { code: "EPP-006", name: "Botas Industriales", category: "Protección de pies", standardReference: "ASTM F2413", replacementPeriodDays: 730 },
];

export async function seedWarehouseData() {
  logger.info("Starting warehouse data seed...");

  // -------------------------------------------------------------------------
  // USERS — idempotent: check existence by email before inserting
  // -------------------------------------------------------------------------
  const userIds: Record<string, string> = {};
  for (const user of demoUsers) {
    try {
      const existing = await db
        .select({ id: usersTable.id })
        .from(usersTable)
        .where(eq(usersTable.email, user.email))
        .limit(1);
      if (existing.length > 0) {
        userIds[user.email] = existing[0]!.id;
        continue;
      }
      const id = generateId();
      const passwordHash = await hashPassword(user.password);
      await db.insert(usersTable).values({
        id,
        email: user.email,
        name: user.name,
        role: user.role,
        passwordHash,
        status: "active",
      }).onConflictDoNothing();
      userIds[user.email] = id;
    } catch (err) {
      logger.warn({ email: user.email, err }, "Could not insert user");
    }
  }
  logger.info({ count: Object.keys(userIds).length }, "Users seeded");

  // Resolve user IDs — if a user already existed, userIds[email] is populated
  // above. If for any reason it's missing, fall back to a fresh ID so we never
  // pass undefined as a FK value (which would cause a FK violation).
  const supervisorId = userIds["supervisor@almacen.com"] ?? generateId();
  const operatorId = userIds["operario@almacen.com"] ?? generateId();
  const qualityId = userIds["calidad@almacen.com"] ?? generateId();

  // -------------------------------------------------------------------------
  // PRODUCTS — idempotent via onConflictDoNothing on the unique `code` column.
  //
  // CRITICAL FIX: After the insert attempt we ALWAYS fetch the real ID from
  // the database. This is the root cause of the FK errors:
  //
  //   Old code:  productIds[code] = freshId  ← WRONG when product already
  //              existed (onConflictDoNothing silently skips the insert, but
  //              the freshId was never committed — the real row has a
  //              different ID from a previous seed run).
  //
  //   New code:  insert → then SELECT the actual id by code → store that.
  //              This guarantees productIds[code] always holds the real DB id.
  // -------------------------------------------------------------------------
  const productIds: Record<string, string> = {};

  for (const product of chemicalProducts) {
    try {
      await db.insert(productsTable).values({
        id: generateId(),
        ...product,
        status: "active",
      }).onConflictDoNothing();
    } catch (err) {
      logger.warn({ code: product.code, err }, "Could not insert product");
    }
  }

  // Fetch actual IDs from DB for ALL products (covers both new inserts and
  // pre-existing rows from a previous seed run).
  const codes = chemicalProducts.map((p) => p.code);
  const dbProducts = await db
    .select({ id: productsTable.id, code: productsTable.code })
    .from(productsTable)
    .where(inArray(productsTable.code, codes));

  for (const row of dbProducts) {
    productIds[row.code] = row.id;
  }

  logger.info({ count: Object.keys(productIds).length }, "Products seeded");

  const today = new Date().toISOString().split("T")[0]!;

  // -------------------------------------------------------------------------
  // INVENTORY RECORDS — idempotent: skip if a record for this product+date
  // already exists (no unique constraint on the table, so we guard manually).
  // -------------------------------------------------------------------------
  const inventorySamples = [
    { productCode: "PROD-001", prev: "200", inputs: "100", outputs: "80" },
    { productCode: "PROD-002", prev: "500", inputs: "200", outputs: "150" },
    { productCode: "PROD-003", prev: "120", inputs: "50", outputs: "40" },
    { productCode: "PROD-004", prev: "250", inputs: "100", outputs: "60" },
    { productCode: "PROD-005", prev: "180", inputs: "80", outputs: "70" },
    { productCode: "PROD-006", prev: "80", inputs: "30", outputs: "20" },
    { productCode: "PROD-007", prev: "100", inputs: "50", outputs: "30" },
    { productCode: "PROD-010", prev: "40", inputs: "20", outputs: "10" },
    { productCode: "PROD-012", prev: "160", inputs: "60", outputs: "50" },
    { productCode: "PROD-015", prev: "75", inputs: "40", outputs: "25" },
  ];

  for (const inv of inventorySamples) {
    const pId = productIds[inv.productCode];
    if (!pId) {
      logger.warn({ productCode: inv.productCode }, "Skipping inventory record — product not found in DB");
      continue;
    }
    try {
      // Guard: skip if a seed record already exists for this product on today
      const existing = await db
        .select({ id: inventoryRecordsTable.id })
        .from(inventoryRecordsTable)
        .where(eq(inventoryRecordsTable.productId, pId))
        .limit(1);
      if (existing.length > 0) continue;

      const finalBal = String(parseFloat(inv.prev) + parseFloat(inv.inputs) - parseFloat(inv.outputs));
      await db.insert(inventoryRecordsTable).values({
        id: generateId(),
        productId: pId,
        recordDate: today,
        previousBalance: inv.prev,
        inputs: inv.inputs,
        outputs: inv.outputs,
        finalBalance: finalBal,
        registeredBy: operatorId,
        notes: "Registro inicial de inventario",
      });
    } catch (err) {
      logger.warn({ productCode: inv.productCode, err }, "Could not insert inventory record");
    }
  }
  logger.info({ count: inventorySamples.length }, "Inventory records seeded");

  // -------------------------------------------------------------------------
  // IMMOBILIZED PRODUCTS — idempotent: skip if product already has a record
  // -------------------------------------------------------------------------
  const immobilizedData = [
    { productCode: "PROD-006", qty: "15", reason: "Contaminación por humedad durante transporte" },
    { productCode: "PROD-011", qty: "10", reason: "Certificado de calidad vencido" },
    { productCode: "PROD-017", qty: "3", reason: "Sospechas de adulteración - en investigación" },
  ];

  for (const item of immobilizedData) {
    const pId = productIds[item.productCode];
    if (!pId) {
      logger.warn({ productCode: item.productCode }, "Skipping immobilized record — product not found in DB");
      continue;
    }
    try {
      const existing = await db
        .select({ id: immobilizedProductsTable.id })
        .from(immobilizedProductsTable)
        .where(eq(immobilizedProductsTable.productId, pId))
        .limit(1);
      if (existing.length > 0) continue;

      await db.insert(immobilizedProductsTable).values({
        id: generateId(),
        productId: pId,
        quantity: item.qty,
        reason: item.reason,
        immobilizedDate: today,
        status: "immobilized",
        registeredBy: supervisorId,
      });
    } catch (err) {
      logger.warn({ productCode: item.productCode, err }, "Could not insert immobilized product");
    }
  }
  logger.info({ count: immobilizedData.length }, "Immobilized products seeded");

  // -------------------------------------------------------------------------
  // SAMPLES — idempotent via onConflictDoNothing on unique `sample_code`
  // -------------------------------------------------------------------------
  const samplesData = [
    { productCode: "PROD-001", code: "MUEST-001", qty: "0.5", purpose: "Control de calidad rutinario", destination: "Lab. Externo ABC" },
    { productCode: "PROD-005", code: "MUEST-002", qty: "0.3", purpose: "Verificación de concentración", destination: "Lab. Interno" },
    { productCode: "PROD-007", code: "MUEST-003", qty: "1.0", purpose: "Análisis de estabilidad", destination: "Lab. Externo XYZ" },
    { productCode: "PROD-009", code: "MUEST-004", qty: "5.0", purpose: "Ensayo de pureza", destination: "Lab. Certificado INDECOPI" },
  ];

  for (const s of samplesData) {
    const pId = productIds[s.productCode];
    if (!pId) {
      logger.warn({ sampleCode: s.code }, "Skipping sample — product not found in DB");
      continue;
    }
    try {
      await db.insert(samplesTable).values({
        id: generateId(),
        productId: pId,
        sampleCode: s.code,
        quantity: s.qty,
        unit: "L",
        sampleDate: today,
        purpose: s.purpose,
        destination: s.destination,
        status: "pending",
        takenBy: qualityId,
      }).onConflictDoNothing(); // unique constraint on sample_code
    } catch (err) {
      logger.warn({ code: s.code, err }, "Could not insert sample");
    }
  }
  logger.info({ count: samplesData.length }, "Samples seeded");

  // -------------------------------------------------------------------------
  // DYE LOTS — idempotent: skip if a lot with the same lot number exists
  // -------------------------------------------------------------------------
  const expDate = new Date();
  expDate.setFullYear(expDate.getFullYear() + 2);
  const expDateStr = expDate.toISOString().split("T")[0]!;

  const dyeLotsData = [
    { productCode: "PROD-001", lot: "LOT-2024-001", qty: "200", supplier: "QuimPeru SAC", cert: "CERT-QP-001" },
    { productCode: "PROD-002", lot: "LOT-2024-002", qty: "500", supplier: "QuimPeru SAC", cert: "CERT-QP-002" },
    { productCode: "PROD-010", lot: "LOT-2024-003", qty: "50", supplier: "ReacLab SRL", cert: "CERT-RL-001" },
    { productCode: "PROD-015", lot: "LOT-2024-004", qty: "75", supplier: "QuimPeru SAC", cert: "CERT-QP-003" },
  ];

  for (const dl of dyeLotsData) {
    const pId = productIds[dl.productCode];
    if (!pId) {
      logger.warn({ lot: dl.lot }, "Skipping dye lot — product not found in DB");
      continue;
    }
    try {
      const existing = await db
        .select({ id: dyeLotsTable.id })
        .from(dyeLotsTable)
        .where(eq(dyeLotsTable.lotNumber, dl.lot))
        .limit(1);
      if (existing.length > 0) continue;

      await db.insert(dyeLotsTable).values({
        id: generateId(),
        productId: pId,
        lotNumber: dl.lot,
        quantity: dl.qty,
        expirationDate: expDateStr,
        receiptDate: today,
        supplier: dl.supplier,
        certificateNumber: dl.cert,
        qualityStatus: "approved",
        approvedBy: qualityId,
        approvedAt: new Date(),
        registeredBy: operatorId,
      });
    } catch (err) {
      logger.warn({ lot: dl.lot, err }, "Could not insert dye lot");
    }
  }
  logger.info({ count: dyeLotsData.length }, "Dye lots seeded");

  // -------------------------------------------------------------------------
  // FINAL DISPOSITION — idempotent: skip if manifest number already exists
  // -------------------------------------------------------------------------
  const dispositionData = [
    { productCode: "PROD-008", qty: "5", type: "Incineración", contractor: "EcoTreat SAC", manifest: "MAN-2024-001" },
    { productCode: "PROD-014", qty: "8", type: "Reciclaje", contractor: "ChemRecycle Perú", manifest: "MAN-2024-002" },
    { productCode: "PROD-020", qty: "3", type: "Tratamiento fisicoquímico", contractor: "AquaChem SAC", manifest: "MAN-2024-003" },
  ];

  for (const d of dispositionData) {
    const pId = productIds[d.productCode];
    if (!pId) {
      logger.warn({ manifest: d.manifest }, "Skipping disposition — product not found in DB");
      continue;
    }
    try {
      const existing = await db
        .select({ id: finalDispositionTable.id })
        .from(finalDispositionTable)
        .where(eq(finalDispositionTable.manifestNumber, d.manifest))
        .limit(1);
      if (existing.length > 0) continue;

      await db.insert(finalDispositionTable).values({
        id: generateId(),
        productId: pId,
        quantity: d.qty,
        unit: "L",
        dispositionType: d.type,
        dispositionDate: today,
        contractor: d.contractor,
        manifestNumber: d.manifest,
        status: "completed",
        approvedBy: supervisorId,
        registeredBy: operatorId,
      });
    } catch (err) {
      logger.warn({ type: d.type, err }, "Could not insert disposition");
    }
  }
  logger.info({ count: dispositionData.length }, "Final dispositions seeded");

  // -------------------------------------------------------------------------
  // PERSONNEL — idempotent via onConflictDoNothing on unique `employee_id`
  // -------------------------------------------------------------------------
  for (const p of demoPersonnel) {
    try {
      await db.insert(personnelTable).values({
        id: generateId(),
        ...p,
        status: "active",
      }).onConflictDoNothing();
    } catch (err) {
      logger.warn({ employeeId: p.employeeId, err }, "Could not insert personnel");
    }
  }
  logger.info({ count: demoPersonnel.length }, "Personnel seeded");

  // -------------------------------------------------------------------------
  // EPP CATALOG — idempotent via onConflictDoNothing on unique `code`
  // -------------------------------------------------------------------------
  for (const epp of demoEpp) {
    try {
      await db.insert(eppMasterTable).values({
        id: generateId(),
        ...epp,
        status: "active",
      }).onConflictDoNothing();
    } catch (err) {
      logger.warn({ code: epp.code, err }, "Could not insert EPP item");
    }
  }
  logger.info({ count: demoEpp.length }, "EPP catalog seeded");

  logger.info("Warehouse data seed complete!");
}

// ---------------------------------------------------------------------------
// purgeDemoData — elimina todos los datos demo (productos PROD-*) y registros
// asociados. Se activa únicamente cuando CLEANUP_DEMO_DATA=true al arrancar.
// ---------------------------------------------------------------------------
export async function purgeDemoData() {
  logger.info("Iniciando purga de datos demo (PROD-*)...");

  // 1. Obtener IDs de todos los productos demo
  const demoProducts = await db
    .select({ id: productsTable.id })
    .from(productsTable)
    .where(like(productsTable.code, "PROD-%"));

  if (demoProducts.length === 0) {
    logger.info("No se encontraron productos demo. Nada que purgar.");
    return;
  }

  const demoIds = demoProducts.map((p) => p.id);
  logger.info({ count: demoIds.length }, "Productos demo encontrados — eliminando datos asociados...");

  // 2. Obtener IDs de inventory_records demo
  const demoInvRecords = await db
    .select({ id: inventoryRecordsTable.id })
    .from(inventoryRecordsTable)
    .where(inArray(inventoryRecordsTable.productId, demoIds));

  const demoInvIds = demoInvRecords.map((r) => r.id);

  // 3. Eliminar inventory_boxes asociados
  if (demoInvIds.length > 0) {
    await db.delete(inventoryBoxesTable).where(inArray(inventoryBoxesTable.inventoryRecordId, demoInvIds));
    logger.info({ count: demoInvIds.length }, "inventory_boxes demo eliminados");
  }

  // 4. Eliminar inventory_records demo
  if (demoInvIds.length > 0) {
    await db.delete(inventoryRecordsTable).where(inArray(inventoryRecordsTable.id, demoInvIds));
    logger.info({ count: demoInvIds.length }, "inventory_records demo eliminados");
  }

  // 5. Eliminar dye_lots demo
  await db.delete(dyeLotsTable).where(inArray(dyeLotsTable.productId, demoIds));
  logger.info("dye_lots demo eliminados");

  // 6. Eliminar immobilized_products demo
  await db.delete(immobilizedProductsTable).where(inArray(immobilizedProductsTable.productId, demoIds));
  logger.info("immobilized_products demo eliminados");

  // 7. Eliminar samples demo
  await db.delete(samplesTable).where(inArray(samplesTable.productId, demoIds));
  logger.info("samples demo eliminados");

  // 8. Eliminar final_disposition demo
  await db.delete(finalDispositionTable).where(inArray(finalDispositionTable.productId, demoIds));
  logger.info("final_disposition demo eliminados");

  // 9. Eliminar los productos demo
  await db.delete(productsTable).where(inArray(productsTable.id, demoIds));
  logger.info({ count: demoIds.length }, "Productos demo eliminados");

  logger.info("Purga de datos demo completada correctamente.");
}
