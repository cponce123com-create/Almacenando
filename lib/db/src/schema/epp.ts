import { pgTable, text, timestamp, date, integer } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { usersTable } from "./users";
import { personnelTable } from "./personnel";

export const eppMasterTable = pgTable("epp_master", {
  id: text("id").primaryKey(),
  code: text("code").notNull().unique(),
  name: text("name").notNull(),
  category: text("category").notNull(),
  description: text("description"),
  standardReference: text("standard_reference"),
  replacementPeriodDays: integer("replacement_period_days"),
  status: text("status").notNull().default("active"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const eppDeliveriesTable = pgTable("epp_deliveries", {
  id: text("id").primaryKey(),
  eppId: text("epp_id").notNull().references(() => eppMasterTable.id),
  personnelId: text("personnel_id").notNull().references(() => personnelTable.id),
  deliveryDate: date("delivery_date").notNull(),
  quantity: integer("quantity").notNull().default(1),
  condition: text("condition").notNull().default("new"),
  returnDate: date("return_date"),
  returnCondition: text("return_condition"),
  notes: text("notes"),
  deliveredBy: text("delivered_by").notNull().references(() => usersTable.id),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const eppChecklistsTable = pgTable("epp_checklists", {
  id: text("id").primaryKey(),
  personnelId: text("personnel_id").notNull().references(() => personnelTable.id),
  checkDate: date("check_date").notNull(),
  items: text("items").notNull(),
  overallStatus: text("overall_status").notNull().default("compliant"),
  notes: text("notes"),
  reviewedBy: text("reviewed_by").notNull().references(() => usersTable.id),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const insertEppMasterSchema = createInsertSchema(eppMasterTable).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});
export const insertEppDeliverySchema = createInsertSchema(eppDeliveriesTable).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});
export const insertEppChecklistSchema = createInsertSchema(eppChecklistsTable).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type InsertEppMaster = z.infer<typeof insertEppMasterSchema>;
export type EppMaster = typeof eppMasterTable.$inferSelect;
export type InsertEppDelivery = z.infer<typeof insertEppDeliverySchema>;
export type EppDelivery = typeof eppDeliveriesTable.$inferSelect;
export type InsertEppChecklist = z.infer<typeof insertEppChecklistSchema>;
export type EppChecklist = typeof eppChecklistsTable.$inferSelect;
