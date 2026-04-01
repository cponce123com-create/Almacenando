import { pgTable, text, boolean, timestamp, index, unique } from "drizzle-orm/pg-core";
import { warehouseRoleEnum } from "./users";
import { usersTable } from "./users";

export const userPermissionsTable = pgTable("user_permissions", {
  id: text("id").primaryKey(),
  role: warehouseRoleEnum("role").notNull(),
  pageId: text("page_id").notNull(),
  canView: boolean("can_view").notNull().default(true),
  canImport: boolean("can_import").notNull().default(false),
  canExport: boolean("can_export").notNull().default(false),
  canEdit: boolean("can_edit").notNull().default(false),
  canDelete: boolean("can_delete").notNull().default(false),
  updatedBy: text("updated_by").references(() => usersTable.id),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
}, (t) => [
  index("permissions_role_page_idx").on(t.role, t.pageId),
  unique("permissions_role_page_unique").on(t.role, t.pageId),
]);

export type UserPermission = typeof userPermissionsTable.$inferSelect;
