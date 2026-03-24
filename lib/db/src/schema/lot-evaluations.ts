import { pgTable, text, timestamp, date } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { usersTable } from "./users";

export const INTERPRETED_STATUSES = [
  "CONFORME",
  "CONFORME NO MEZCLAR",
  "NO CONFORME",
  "FALTA ETIQUETAR",
  "OBSERVACION",
  "REVISAR",
] as const;

export type InterpretedStatus = typeof INTERPRETED_STATUSES[number];

export function interpretLotStatus(comments: string | null | undefined): InterpretedStatus {
  const upper = (comments ?? "").toUpperCase().trim();
  if (!upper) return "REVISAR";
  if (upper.includes("NO CONFORME") || upper.includes("NO CONFORM")) return "NO CONFORME";
  if (
    upper.includes("CONFORME") &&
    (upper.includes("NO MEZCLAR") || upper.includes("NO MESCLAR") || upper.includes("NO MEZCLA"))
  )
    return "CONFORME NO MEZCLAR";
  if (upper.includes("CONFORME") || upper.includes("CONFORM")) return "CONFORME";
  if (upper.includes("F/E") || upper.includes("FALTA ETIQUETAR") || upper.includes("FALTA ETI"))
    return "FALTA ETIQUETAR";
  if (upper.includes("OBSERV") || upper.includes("OBS")) return "OBSERVACION";
  return "REVISAR";
}

export const lotEvaluationsTable = pgTable("lot_evaluations", {
  id: text("id").primaryKey(),
  colorantName: text("colorant_name").notNull(),
  usageLot: text("usage_lot").notNull(),
  newLot: text("new_lot").notNull(),
  approvalDate: date("approval_date"),
  comments: text("comments"),
  interpretedStatus: text("interpreted_status").notNull().default("REVISAR"),
  active: text("active").notNull().default("true"),
  registeredBy: text("registered_by").notNull().references(() => usersTable.id),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const insertLotEvaluationSchema = createInsertSchema(lotEvaluationsTable).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type InsertLotEvaluation = z.infer<typeof insertLotEvaluationSchema>;
export type LotEvaluation = typeof lotEvaluationsTable.$inferSelect;
