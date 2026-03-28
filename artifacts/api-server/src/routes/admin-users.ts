import { Router } from "express";
import { db } from "@workspace/db";
import { usersTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { requireAuth, requireRole, hashPassword, type AuthenticatedRequest } from "../lib/auth.js";
import { generateId } from "../lib/id.js";
import { z } from "zod";
import type { WarehouseRole } from "@workspace/db";
import { asyncHandler } from "../lib/async-handler.js";
import { writeAuditLog } from "../lib/audit.js";

const router = Router();

const createUserSchema = z.object({
  email: z.string().email(),
  name: z.string().min(1),
  password: z
    .string()
    .min(8, "La contraseña debe tener al menos 8 caracteres")
    .regex(/[A-Z]/, "Debe tener al menos una mayúscula")
    .regex(/[0-9]/, "Debe tener al menos un número"),
  role: z.enum(["supervisor", "operator", "quality", "admin", "readonly"]),
});

const updateUserSchema = z.object({
  name: z.string().min(1).optional(),
  email: z.string().email().optional(),
  role: z.enum(["supervisor", "operator", "quality", "admin", "readonly"]).optional(),
  status: z.enum(["active", "inactive"]).optional(),
  password: z
    .string()
    .min(8, "La contraseña debe tener al menos 8 caracteres")
    .regex(/[A-Z]/, "Debe tener al menos una mayúscula")
    .regex(/[0-9]/, "Debe tener al menos un número")
    .optional(),
});

function generateTemporaryPassword(): string {
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789!@#$%";
  let password = "";
  for (let i = 0; i < 12; i++) {
    password += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return password;
}

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
    res.status(400).json({ error: "Datos inválidos" });
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

router.post("/:id/reset-password", requireAuth, requireRole("admin"), asyncHandler(async (req, res) => {
  const { id } = req.params;
  const users = await db.select().from(usersTable).where(eq(usersTable.id, id as string)).limit(1);
  if (users.length === 0) {
    res.status(404).json({ error: "Usuario no encontrado" });
    return;
  }
  const temporaryPassword = generateTemporaryPassword();
  const passwordHash = await hashPassword(temporaryPassword);
  const [updated] = await db.update(usersTable).set({ passwordHash, updatedAt: new Date() }).where(eq(usersTable.id, id as string)).returning({
    id: usersTable.id,
    email: usersTable.email,
    name: usersTable.name,
  });
  res.json({
    message: "Contraseña temporal generada",
    user: updated,
    temporaryPassword,
  });
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

export default router;
