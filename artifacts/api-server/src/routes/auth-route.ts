import { Router } from "express";
import { db } from "@workspace/db";
import { usersTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { hashPassword, comparePassword, signToken, requireAuth, type AuthenticatedRequest } from "../lib/auth.js";
import { generateId } from "../lib/id.js";
import { z } from "zod";
import { authLoginLimiter } from "../lib/rate-limit.js";
import { asyncHandler } from "../lib/async-handler.js";

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

router.post("/logout", (_req, res) => {
  res.json({ message: "Sesión cerrada correctamente" });
});

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

const updateProfileSchema = z.object({
  name: z.string().min(1, "El nombre es requerido").optional(),
  email: z.string().email("Email inválido").optional(),
  currentPassword: z.string().optional(),
  newPassword: z.string().min(8, "La contraseña debe tener al menos 8 caracteres").optional(),
});

router.put("/me", requireAuth, asyncHandler(async (req, res) => {
  const authedReq = req as AuthenticatedRequest;
  const { userId } = authedReq;
  const parsed = updateProfileSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.issues[0]?.message ?? "Datos inválidos" });
    return;
  }
  const { name, email, currentPassword, newPassword } = parsed.data;
  const users = await db.select().from(usersTable).where(eq(usersTable.id, userId)).limit(1);
  if (users.length === 0) {
    res.status(401).json({ error: "Usuario no encontrado" });
    return;
  }
  const user = users[0]!;
  if (newPassword) {
    if (!currentPassword) {
      res.status(400).json({ error: "Debes proporcionar tu contraseña actual para cambiarla" });
      return;
    }
    const valid = await comparePassword(currentPassword, user.passwordHash);
    if (!valid) {
      res.status(401).json({ error: "Contraseña actual incorrecta" });
      return;
    }
  }
  if (email && email !== user.email) {
    const existing = await db.select({ id: usersTable.id }).from(usersTable).where(eq(usersTable.email, email)).limit(1);
    if (existing.length > 0) {
      res.status(409).json({ error: "El correo ya está registrado" });
      return;
    }
  }
  const updateData: Record<string, unknown> = { updatedAt: new Date() };
  if (name) updateData.name = name;
  if (email) updateData.email = email;
  if (newPassword) {
    updateData.passwordHash = await hashPassword(newPassword);
  }
  const [updated] = await db.update(usersTable).set(updateData).where(eq(usersTable.id, userId)).returning({
    id: usersTable.id,
    email: usersTable.email,
    name: usersTable.name,
    role: usersTable.role,
    status: usersTable.status,
    createdAt: usersTable.createdAt,
  });
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
