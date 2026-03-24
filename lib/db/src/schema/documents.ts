import { pgTable, text, timestamp, date } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { usersTable } from "./users";

export const documentsTable = pgTable("documents", {
  id: text("id").primaryKey(),
  title: text("title").notNull(),
  documentType: text("document_type").notNull(),
  fileUrl: text("file_url"),
  version: text("version"),
  issueDate: date("issue_date"),
  expirationDate: date("expiration_date"),
  responsibleParty: text("responsible_party"),
  status: text("status").notNull().default("active"),
  notes: text("notes"),
  uploadedBy: text("uploaded_by").notNull().references(() => usersTable.id),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const insertDocumentSchema = createInsertSchema(documentsTable).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type InsertDocument = z.infer<typeof insertDocumentSchema>;
export type Document = typeof documentsTable.$inferSelect;
