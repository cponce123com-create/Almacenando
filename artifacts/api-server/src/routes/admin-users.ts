import { Router } from "express";
import { db } from "@workspace/db";
import { usersTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { requireAuth, requireRole, hashPassword, type AuthenticatedRequest } from "../lib/auth.js";
import { generateId } from "../lib/id.js";
import { z } from "zod";
import type { WarehouseRole } from "@workspace/db";
import { asyncHandler } from "../lib/async-handler.js";

const router = Router();

const createUserSchema = z.object({
  email: z.string().email(),
  name: z.string().min(1),
  password: z.string().min(8, "La contraseña debe tener al menos 8 caracteres"),
  role: z.enum(["supervisor", "operator", "quality", "admin", "readonly"]),
});

// Schema para actualización por admin (puede cambiar rol y estado)
const adminUpdateSchema = z.object({
  name: z.string().min(1).optional(),
  email: z.string().email().optional(),
  role: z.enum(["supervisor", "operator", "quality", "admin", "readonly"]).optional(),
  status: z.enum(["active", "inactive"]).optional(),
  password: z.string().min(8, "La contraseña debe tener al menos 8 caracteres").optional(),
});

// Schema para que el propio usuario edite su perfil (NO puede cambiar su rol ni status)
const selfUpdateSchema = z.object({
  name: z.string().min(1).optional(),
  email: z.string().email().optional(),
  password: z.string().min(8, "La contraseña debe tener al menos 8 caracteres").optional(),
});

// ---------------------------------------------------------------------------
// GET /admin/users — lista todos los usuarios (admin y supervisor pueden ver)
// ---------------------------------------------------------------------------
router.get("/", requireAuth, requireRole("admin", "supervisor"), asyncHandler(async (_req, res) => {
  const users = await db.select({
    id: usersTable.id,
    email: usersTable.email,
    name: usersTable.name,
    role: usersTable.role,
    status: usersTable.status,
    createdAt: usersTable.createdAt,
    updatedAt: usersTable.updatedAt,
  }).from(usersTable).orderBy(usersTable.name);
  res.json(users);
}));

// ---------------------------------------------------------------------------
// GET /admin/users/me — cualquier usuario autenticado puede ver su propio perfil
// ---------------------------------------------------------------------------
router.get("/me", requireAuth, asyncHandler(async (req, res) => {
  const authedReq = req as AuthenticatedRequest;
  const [user] = await db.select({
    id: usersTable.id,
    email: usersTable.email,
    name: usersTable.name,
    role: usersTable.role,
    status: usersTable.status,
    createdAt: usersTable.createdAt,
    updatedAt: usersTable.updatedAt,
  }).from(usersTable).where(eq(usersTable.id, authedReq.userId)).limit(1);

  if (!user) {
    res.status(404).json({ error: "Usuario no encontrado" });
    return;
  }
  res.json(user);
}));

// ---------------------------------------------------------------------------
// POST /admin/users — crear usuario (solo admin)
// ---------------------------------------------------------------------------
router.post("/", requireAuth, requireRole("admin"), asyncHandler(async (req, res) => {
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
  res.status(201).json(created);
}));

// ---------------------------------------------------------------------------
// PUT /admin/users/me — el usuario autenticado edita su PROPIO perfil
// Permite cambiar: nombre, email, contraseña. NO permite cambiar rol ni estado.
// ---------------------------------------------------------------------------
router.put("/me", requireAuth, asyncHandler(async (req, res) => {
  const authedReq = req as AuthenticatedRequest;

  const parsed = selfUpdateSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.issues[0]?.message ?? "Datos inválidos" });
    return;
  }

  const { password, ...rest } = parsed.data;

  // Si cambia el email, verificar que no esté en uso por otro usuario
  if (rest.email) {
    const existing = await db.select({ id: usersTable.id })
      .from(usersTable)
      .where(eq(usersTable.email, rest.email))
      .limit(1);
    if (existing.length > 0 && existing[0].id !== authedReq.userId) {
      res.status(409).json({ error: "Ese correo ya está en uso por otro usuario" });
      return;
    }
  }

  const updateData: Record<string, unknown> = { ...rest, updatedAt: new Date() };
  if (password) {
    updateData.passwordHash = await hashPassword(password);
  }

  const [updated] = await db.update(usersTable)
    .set(updateData)
    .where(eq(usersTable.id, authedReq.userId))
    .returning({
      id: usersTable.id,
      email: usersTable.email,
      name: usersTable.name,
      role: usersTable.role,
      status: usersTable.status,
      createdAt: usersTable.createdAt,
      updatedAt: usersTable.updatedAt,
    });

  if (!updated) {
    res.status(404).json({ error: "Usuario no encontrado" });
    return;
  }
  res.json(updated);
}));

// ---------------------------------------------------------------------------
// PUT /admin/users/:id — admin edita cualquier usuario (incluye rol y estado)
// ---------------------------------------------------------------------------
router.put("/:id", requireAuth, requireRole("admin"), asyncHandler(async (req, res) => {
  const { id } = req.params;
  const authedReq = req as AuthenticatedRequest;

  const parsed = adminUpdateSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.issues[0]?.message ?? "Datos inválidos" });
    return;
  }

  const { password, ...rest } = parsed.data;

  // Si el admin se edita a sí mismo, no puede cambiar su propio rol ni desactivarse
  if (id === authedReq.userId) {
    if (rest.role && rest.role !== "admin") {
      res.status(400).json({ error: "No puedes cambiar tu propio rol. Usa 'Editar mi perfil' para cambios personales." });
      return;
    }
    if (rest.status === "inactive") {
      res.status(400).json({ error: "No puedes desactivar tu propia cuenta" });
      return;
    }
  }

  // Si cambia el email, verificar duplicados
  if (rest.email) {
    const existing = await db.select({ id: usersTable.id })
      .from(usersTable)
      .where(eq(usersTable.email, rest.email))
      .limit(1);
    if (existing.length > 0 && existing[0].id !== id) {
      res.status(409).json({ error: "Ese correo ya está en uso por otro usuario" });
      return;
    }
  }

  const updateData: Record<string, unknown> = { ...rest, updatedAt: new Date() };
  if (password) {
    updateData.passwordHash = await hashPassword(password);
  }

  const [updated] = await db.update(usersTable)
    .set(updateData)
    .where(eq(usersTable.id, id as string))
    .returning({
      id: usersTable.id,
      email: usersTable.email,
      name: usersTable.name,
      role: usersTable.role,
      status: usersTable.status,
      createdAt: usersTable.createdAt,
      updatedAt: usersTable.updatedAt,
    });

  if (!updated) {
    res.status(404).json({ error: "Usuario no encontrado" });
    return;
  }
  res.json(updated);
}));

// ---------------------------------------------------------------------------
// DELETE /admin/users/:id — eliminar usuario (solo admin, no puede eliminarse a sí mismo)
// ---------------------------------------------------------------------------
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
  res.json({ message: "Usuario eliminado" });
}));

export default router;
