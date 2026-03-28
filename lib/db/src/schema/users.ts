import { pgTable, text, timestamp, pgEnum } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const warehouseRoles = ["supervisor", "operator", "quality", "admin", "readonly"] as const;
export type WarehouseRole = typeof warehouseRoles[number];

export const warehouseRoleEnum = pgEnum("warehouse_role", [...warehouseRoles] as [string, ...string[]]);
export const userStatusEnum = pgEnum("user_status", ["active", "inactive"]);

export const usersTable = pgTable("users", {
  id: text("id").primaryKey(),
  email: text("email").notNull().unique(),
  name: text("name").notNull(),
  passwordHash: text("password_hash").notNull(),
  role: warehouseRoleEnum("role").notNull().default("operator"),
  status: userStatusEnum("status").notNull().default("active"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const insertUserSchema = createInsertSchema(usersTable).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type InsertUser = z.infer<typeof insertUserSchema>;
export type User = typeof usersTable.$inferSelect;
