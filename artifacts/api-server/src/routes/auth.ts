import { Router } from "express";
import { db } from "@workspace/db";
import { usersTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { hashPassword, comparePassword, signToken, requireAuth, type AuthenticatedRequest } from "../lib/auth.js";
import { generateId } from "../lib/id.js";
import { z } from "zod";
import { authLoginLimiter } from "../lib/rate-limit.js";
import { asyncHandler } from "../lib/async-handler.js";
import { writeAuditLog } from "../lib/audit.js";

const router = Router();

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string(),
});

router.post("/login", authLoginLimiter, asyncHandler(async (req, res) => {
  const parsed = loginSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Datos de login inválidos" });
    return;
  }

  const { email, password } = parsed.data;
  const users = await db.select().from(usersTable).where(eq(usersTable.email, email)).limit(1);
  if (users.length === 0) {
    res.status(401).json({ error: "Correo o contraseña incorrectos" });
    return;
  }

  const user = users[0]!;
  if (user.status !== "active") {
    res.status(401).json({ error: "Cuenta desactivada. Contacte al administrador." });
    return;
  }

  const valid = await comparePassword(password, user.passwordHash);
  if (!valid) {
    res.status(401).json({ error: "Correo o contraseña incorrectos" });
    return;
  }

  const token = signToken({ userId: user.id, email: user.email, role: user.role });
  void writeAuditLog({ userId: user.id, action: "login", resource: "session", resourceId: user.id, ipAddress: req.ip });
  res.json({
    user: {
      id: user.id,
      email: user.email,
      name: user.name,
      role: user.role,
      status: user.status,
      createdAt: user.createdAt.toISOString(),
    },
    token,
  });
}));

router.post("/logout", requireAuth, asyncHandler(async (req, res) => {
  const { userId } = req as AuthenticatedRequest;
  void writeAuditLog({ userId, action: "logout", resource: "session", resourceId: userId, ipAddress: req.ip });
  res.json({ message: "Sesión cerrada correctamente" });
}));

router.get("/me", requireAuth, asyncHandler(async (req, res) => {
  const { userId } = req as AuthenticatedRequest;
  const users = await db.select().from(usersTable).where(eq(usersTable.id, userId)).limit(1);
  if (users.length === 0) {
    res.status(401).json({ error: "Usuario no encontrado" });
    return;
  }
  const user = users[0]!;
  res.json({
    id: user.id,
    email: user.email,
    name: user.name,
    role: user.role,
    status: user.status,
    createdAt: user.createdAt.toISOString(),
  });
}));

const updateMeSchema = z.object({
  name: z.string().min(1).optional(),
  email: z.string().email().optional(),
  currentPassword: z.string().optional(),
  newPassword: z
    .string()
    .min(8, "La contraseña debe tener al menos 8 caracteres")
    .regex(/[A-Z]/, "Debe tener al menos una mayúscula")
    .regex(/[0-9]/, "Debe tener al menos un número")
    .optional(),
});

router.put("/me", requireAuth, asyncHandler(async (req, res) => {
  const authedReq = req as AuthenticatedRequest;
  const parsed = updateMeSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.issues[0]?.message ?? "Datos inválidos" });
    return;
  }

  const users = await db.select().from(usersTable).where(eq(usersTable.id, authedReq.userId)).limit(1);
  if (users.length === 0) { res.status(404).json({ error: "Usuario no encontrado" }); return; }
  const user = users[0]!;

  const updateData: Record<string, unknown> = { updatedAt: new Date() };
  if (parsed.data.name) updateData.name = parsed.data.name;
  if (parsed.data.email) updateData.email = parsed.data.email;

  if (parsed.data.currentPassword && parsed.data.newPassword) {
    const valid = await comparePassword(parsed.data.currentPassword, user.passwordHash);
    if (!valid) { res.status(400).json({ error: "Contraseña actual incorrecta" }); return; }
    updateData.passwordHash = await hashPassword(parsed.data.newPassword);
  }

  const [updated] = await db.update(usersTable)
    .set(updateData)
    .where(eq(usersTable.id, authedReq.userId))
    .returning();

  res.json({
    id: updated!.id,
    email: updated!.email,
    name: updated!.name,
    role: updated!.role,
    status: updated!.status,
    createdAt: updated!.createdAt.toISOString(),
  });
}));

export default router;
