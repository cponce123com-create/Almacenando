import { pgTable, text, timestamp, date, doublePrecision, integer, boolean, index, uniqueIndex } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { productsTable } from "./products";
import { usersTable } from "./users";

/**
 * Ciclos de inventario — cada "ronda" de conteo físico programado.
 * Un ciclo agrupa un conjunto de productos a inventariar en un período.
 */
export const inventoryCyclesTable = pgTable("inventory_cycles", {
  id: text("id").primaryKey(),
  warehouse: text("warehouse").notNull(),
  name: text("name").notNull(),
  description: text("description"),
  startDate: date("start_date").notNull(),
  endDate: date("end_date"),
  status: text("status").notNull().default("active"), // active | closed
  totalProducts: integer("total_products").notNull().default(0),
  countedProducts: integer("counted_products").notNull().default(0),
  withoutMovement: integer("without_movement").notNull().default(0),
  createdBy: text("created_by").notNull().references(() => usersTable.id),
  closedBy: text("closed_by").references(() => usersTable.id),
  closedAt: timestamp("closed_at"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

/**
 * Progreso de cada producto dentro de un ciclo de inventario.
 * Permite saber si un producto ya fue conteado, está pendiente,
 * o se detectó como "sin movimiento" entre saldos importados.
 */
export const inventoryCycleProductsTable = pgTable("inventory_cycle_products", {
  id: text("id").primaryKey(),
  cycleId: text("cycle_id").notNull().references(() => inventoryCyclesTable.id, { onDelete: "cascade" }),
  productId: text("product_id").notNull().references(() => productsTable.id),
  // Saldos importados — batch IDs para trazabilidad
  initialBalanceBatchId: text("initial_balance_batch_id"),
  finalBalanceBatchId: text("final_balance_batch_id"),
  initialQuantity: doublePrecision("initial_quantity"),
  finalQuantity: doublePrecision("final_quantity"),
  // Último consumo — para detectar movimiento
  initialUltimoConsumo: date("initial_ultimo_consumo"),
  finalUltimoConsumo: date("final_ultimo_consumo"),
  // Estado del producto en el ciclo
  status: text("status").notNull().default("pending"),
  // pending | assigned | counted | verified | without_movement | skipped
  assignedDate: date("assigned_date"),
  countedDate: date("counted_date"),
  physicalCount: doublePrecision("physical_count"),
  countedBy: text("counted_by").references(() => usersTable.id),
  difference: doublePrecision("difference"),
  notes: text("notes"),
  inventoryRecordId: text("inventory_record_id"),
  priority: integer("priority").notNull().default(0),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
}, (table) => [
  index("icp_cycle_status_idx").on(table.cycleId, table.status),
  uniqueIndex("icp_cycle_product_uniq").on(table.cycleId, table.productId),
]);

export const insertInventoryCycleSchema = createInsertSchema(inventoryCyclesTable).omit({
  id: true,
  totalProducts: true,
  countedProducts: true,
  withoutMovement: true,
  createdBy: true,
  closedBy: true,
  closedAt: true,
  createdAt: true,
  updatedAt: true,
});

export const insertInventoryCycleProductSchema = createInsertSchema(inventoryCycleProductsTable).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type InsertInventoryCycle = z.infer<typeof insertInventoryCycleSchema>;
export type InventoryCycle = typeof inventoryCyclesTable.$inferSelect;
export type InventoryCycleProduct = typeof inventoryCycleProductsTable.$inferSelect;
