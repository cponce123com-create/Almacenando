import { Router } from "express";
import { createHash, randomBytes } from "crypto";
import { db } from "@workspace/db";
import { usersTable } from "@workspace/db";
import { eq, and, ne, count } from "drizzle-orm";
import { hashPassword, comparePassword, signToken, requireAuth, revokeToken, cleanupExpiredTokens, type AuthenticatedRequest } from "../lib/auth.js";
import { z } from "zod/v4";
import { authLoginLimiter, passwordResetLimiter } from "../lib/rate-limit.js";
import { asyncHandler } from "../lib/async-handler.js";
import { writeAuditLog } from "../lib/audit.js";
import { passwordSchema } from "../lib/password-schema.js";

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
  const authedReq = req as AuthenticatedRequest;
  const { userId, jti, tokenExp } = authedReq;

  await revokeToken(jti, new Date(tokenExp * 1000));

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
  newPassword: passwordSchema.optional(),
});

router.put("/me", requireAuth, asyncHandler(async (req, res) => {
  const authedReq = req as AuthenticatedRequest;
  const parsed = updateMeSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.issues[0]?.message ?? "Datos inválidos" });
    return;
  }

  const { currentPassword, newPassword } = parsed.data;
  if ((currentPassword && !newPassword) || (!currentPassword && newPassword)) {
    res.status(400).json({ error: "Debes proporcionar tanto la contraseña actual como la nueva" });
    return;
  }

  const users = await db.select().from(usersTable).where(eq(usersTable.id, authedReq.userId)).limit(1);
  if (users.length === 0) { res.status(404).json({ error: "Usuario no encontrado" }); return; }
  const user = users[0]!;

  if (parsed.data.email && parsed.data.email !== user.email) {
    const existing = await db.select({ id: usersTable.id })
      .from(usersTable)
      .where(and(eq(usersTable.email, parsed.data.email), ne(usersTable.id, authedReq.userId)))
      .limit(1);
    if (existing.length > 0) {
      res.status(409).json({ error: "El correo ya está en uso por otra cuenta" });
      return;
    }
  }

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

const resetPasswordSchema = z.object({
  token: z.string().min(1),
  newPassword: passwordSchema,
});

router.post("/reset-password", passwordResetLimiter, asyncHandler(async (req, res) => {
  const parsed = resetPasswordSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.issues[0]?.message ?? "Datos inválidos" });
    return;
  }

  const { token, newPassword } = parsed.data;
  const tokenHash = createHash("sha256").update(token).digest("hex");

  const users = await db.select().from(usersTable)
    .where(eq(usersTable.passwordResetToken, tokenHash))
    .limit(1);

  if (users.length === 0) {
    res.status(400).json({ error: "Token inválido o expirado" });
    return;
  }

  const user = users[0]!;

  if (!user.passwordResetExpiresAt || user.passwordResetExpiresAt < new Date()) {
    res.status(400).json({ error: "El enlace de restablecimiento ha expirado. Solicita uno nuevo." });
    return;
  }

  const passwordHash = await hashPassword(newPassword);
  await db.update(usersTable)
    .set({
      passwordHash,
      passwordResetToken: null,
      passwordResetExpiresAt: null,
      updatedAt: new Date(),
    })
    .where(eq(usersTable.id, user.id));

  void writeAuditLog({ userId: user.id, action: "update", resource: "user", resourceId: user.id, details: { action: "password_reset_completed" } });
  res.json({ message: "Contraseña restablecida correctamente. Ya puedes iniciar sesión." });
}));

// ── POST /api/auth/setup ──────────────────────────────────────────────────────
// One-time bootstrap: creates the first admin user when the DB is empty.
// Protected by ADMIN_SETUP_KEY env var. Safe to call multiple times.

router.post("/setup", asyncHandler(async (req, res) => {
  const setupKey = process.env.ADMIN_SETUP_KEY;
  if (!setupKey) {
    res.status(503).json({ error: "Bootstrap no disponible (ADMIN_SETUP_KEY no configurado)" });
    return;
  }

  const { key } = z.object({ key: z.string() }).parse(req.body);
  if (key !== setupKey) {
    res.status(401).json({ error: "Clave de configuración inválida" });
    return;
  }

  // Check how many users already exist
  const [{ total }] = await db.select({ total: count() }).from(usersTable);
  if (Number(total) > 0) {
    res.status(409).json({ error: "El sistema ya tiene usuarios. Bootstrap solo funciona en una base de datos vacía." });
    return;
  }

  // Read admin credentials from production env vars
  const email = process.env.ADMIN_EMAIL;
  const name = process.env.ADMIN_NAME ?? "Administrador";
  const password = process.env.ADMIN_PASSWORD;

  if (!email || !password) {
    res.status(503).json({ error: "ADMIN_EMAIL y ADMIN_PASSWORD deben estar configurados en el entorno de producción" });
    return;
  }

  const id = randomBytes(16).toString("hex");
  const passwordHash = await hashPassword(password);

  await db.insert(usersTable).values({
    id,
    email,
    name,
    passwordHash,
    role: "admin",
    status: "active",
  });

  res.json({ message: `Admin creado correctamente: ${email}` });
}));

export default router;
