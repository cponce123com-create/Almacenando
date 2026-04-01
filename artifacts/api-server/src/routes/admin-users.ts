import { Router } from "express";
import { randomBytes, createHash } from "crypto";
import { db } from "@workspace/db";
import { usersTable, auditLogsTable } from "@workspace/db";
import { eq, desc, count } from "drizzle-orm";
import { requireAuth, requireRole, hashPassword, type AuthenticatedRequest } from "../lib/auth.js";
import { generateId } from "../lib/id.js";
import { z } from "zod/v4";
import type { WarehouseRole } from "@workspace/db";
import { asyncHandler } from "../lib/async-handler.js";
import { writeAuditLog } from "../lib/audit.js";
import { passwordSchema } from "../lib/password-schema.js";
import { passwordResetLimiter } from "../lib/rate-limit.js";
import { sendPasswordResetEmail } from "../lib/email.js";
import { parsePagination } from "../lib/pagination.js";

const router = Router();

const createUserSchema = z.object({
  email: z.string().email(),
  name: z.string().min(1),
  password: passwordSchema,
  role: z.enum(["supervisor", "operator", "quality", "admin", "readonly"]),
});

const updateUserSchema = z.object({
  name: z.string().min(1).optional(),
  email: z.string().email().optional(),
  role: z.enum(["supervisor", "operator", "quality", "admin", "readonly"]).optional(),
  status: z.enum(["active", "inactive"]).optional(),
  password: passwordSchema.optional(),
});

router.get("/", requireAuth, requireRole("admin", "supervisor"), asyncHandler(async (_req, res) => {
  const users = await db.select({
    id: usersTable.id,
    email: usersTable.email,
    name: usersTable.name,
    role: usersTable.role,
    status: usersTable.status,
    createdAt: usersTable.createdAt,
  }).from(usersTable).orderBy(usersTable.name);
  res.json(users);
}));

router.post("/", requireAuth, requireRole("admin"), asyncHandler(async (req, res) => {
  const authedReq = req as AuthenticatedRequest;
  const parsed = createUserSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.issues[0]?.message ?? "Datos inválidos" });
    return;
  }
  const { email, name, password, role } = parsed.data;
  const existing = await db.select({ id: usersTable.id }).from(usersTable).where(eq(usersTable.email, email)).limit(1);
  if (existing.length > 0) {
    res.status(409).json({ error: "El correo ya está registrado" });
    return;
  }
  const passwordHash = await hashPassword(password);
  const id = generateId();
  const [created] = await db.insert(usersTable).values({
    id,
    email,
    name,
    passwordHash,
    role: role as WarehouseRole,
    status: "active",
  }).returning({
    id: usersTable.id,
    email: usersTable.email,
    name: usersTable.name,
    role: usersTable.role,
    status: usersTable.status,
    createdAt: usersTable.createdAt,
  });
  void writeAuditLog({ userId: authedReq.userId, action: "create", resource: "user", resourceId: id, ipAddress: req.ip });
  res.status(201).json(created);
}));

router.put("/:id", requireAuth, requireRole("admin"), asyncHandler(async (req, res) => {
  const authedReq = req as AuthenticatedRequest;
  const { id } = req.params;
  const parsed = updateUserSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.issues[0]?.message ?? "Datos inválidos" });
    return;
  }
  const { password, ...rest } = parsed.data;
  const updateData: Record<string, unknown> = { ...rest, updatedAt: new Date() };
  if (password) {
    updateData.passwordHash = await hashPassword(password);
  }
  const [updated] = await db.update(usersTable).set(updateData).where(eq(usersTable.id, id as string)).returning({
    id: usersTable.id,
    email: usersTable.email,
    name: usersTable.name,
    role: usersTable.role,
    status: usersTable.status,
    createdAt: usersTable.createdAt,
  });
  if (!updated) {
    res.status(404).json({ error: "Usuario no encontrado" });
    return;
  }
  void writeAuditLog({ userId: authedReq.userId, action: "update", resource: "user", resourceId: id, ipAddress: req.ip });
  res.json(updated);
}));

router.post("/:id/reset-password", requireAuth, requireRole("admin"), passwordResetLimiter, asyncHandler(async (req, res) => {
  const authedReq = req as AuthenticatedRequest;
  const { id } = req.params;
  const users = await db.select().from(usersTable).where(eq(usersTable.id, id as string)).limit(1);
  if (users.length === 0) {
    res.status(404).json({ error: "Usuario no encontrado" });
    return;
  }
  const user = users[0]!;

  const rawToken = randomBytes(32).toString("hex");
  const tokenHash = createHash("sha256").update(rawToken).digest("hex");
  const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);

  await db.update(usersTable)
    .set({ passwordResetToken: tokenHash, passwordResetExpiresAt: expiresAt, updatedAt: new Date() })
    .where(eq(usersTable.id, id as string));

  const frontendUrl = process.env.FRONTEND_URL ?? process.env.REPLIT_DEV_DOMAIN
    ? `https://${process.env.REPLIT_DEV_DOMAIN}`
    : "http://localhost:5173";

  await sendPasswordResetEmail({
    toEmail: user.email,
    toName: user.name,
    resetToken: rawToken,
    frontendUrl,
  });

  void writeAuditLog({ userId: authedReq.userId, action: "update", resource: "user", resourceId: id, details: { action: "password_reset_requested" }, ipAddress: req.ip });
  res.json({ message: `Email de reset enviado a ${user.email}` });
}));

router.delete("/:id", requireAuth, requireRole("admin"), asyncHandler(async (req, res) => {
  const authedReq = req as AuthenticatedRequest;
  const { id } = req.params;
  if (id === authedReq.userId) {
    res.status(400).json({ error: "No puedes eliminar tu propia cuenta" });
    return;
  }
  const [deleted] = await db.delete(usersTable).where(eq(usersTable.id, id as string)).returning({ id: usersTable.id });
  if (!deleted) {
    res.status(404).json({ error: "Usuario no encontrado" });
    return;
  }
  void writeAuditLog({ userId: authedReq.userId, action: "delete", resource: "user", resourceId: id, ipAddress: req.ip });
  res.json({ message: "Usuario eliminado" });
}));

router.get("/:id/audit-log", requireAuth, requireRole("admin", "supervisor"), asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { page, limit, offset } = parsePagination(req.query as Record<string, unknown>);
  const logs = await db.select()
    .from(auditLogsTable)
    .where(eq(auditLogsTable.userId, id as string))
    .orderBy(desc(auditLogsTable.createdAt))
    .limit(limit)
    .offset(offset);
  const [total] = await db.select({ count: count() }).from(auditLogsTable).where(eq(auditLogsTable.userId, id as string));
  res.json({ data: logs, pagination: { page, limit, total: total?.count ?? 0 } });
}));

export default router;
