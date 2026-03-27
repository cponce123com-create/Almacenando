import { pgTable, text, timestamp, numeric, integer } from "drizzle-orm/pg-core";
import { inventoryRecordsTable } from "./inventory-records";

export const inventoryBoxesTable = pgTable("inventory_boxes", {
  id: text("id").primaryKey(),
  inventoryRecordId: text("inventory_record_id")
    .notNull()
    .references(() => inventoryRecordsTable.id, { onDelete: "cascade" }),
  boxNumber: integer("box_number").notNull(),
  weight: numeric("weight"),
  lot: text("lot"),
  photoUrl: text("photo_url"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});
