import { Router } from "express";
import { db } from "@workspace/db";
import { usersTable, profilesTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { hashPassword, comparePassword, signToken, verifyToken, requireAuth } from "../lib/auth.js";
import { generateId } from "../lib/id.js";
import { z } from "zod";
import crypto from "crypto";

const router = Router();

function generateEncryptionKey(): string {
  return crypto.randomBytes(32).toString("base64");
}

const registerSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
  fullName: z.string().min(1),
});

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string(),
});

router.post("/register", async (req, res) => {
  const parsed = registerSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.issues[0]?.message ?? "Validation error" });
    return;
  }

  const { email, password, fullName } = parsed.data;
  const existing = await db.select().from(usersTable).where(eq(usersTable.email, email)).limit(1);
  if (existing.length > 0) {
    res.status(409).json({ error: "Email already registered" });
    return;
  }

  const passwordHash = await hashPassword(password);
  const userId = generateId();
  const profileId = generateId();
  const encryptionKey = generateEncryptionKey();

  await db.insert(usersTable).values({
    id: userId,
    email,
    passwordHash,
    status: "active",
    encryptionKey,
  });

  await db.insert(profilesTable).values({
    id: profileId,
    userId,
    fullName,
  });

  const token = signToken({ userId, email });
  res.status(201).json({
    user: { id: userId, email, status: "active", createdAt: new Date().toISOString() },
    token,
    encryptionKey,
  });
});

router.post("/login", async (req, res) => {
  const parsed = loginSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Validation error" });
    return;
  }

  const { email, password } = parsed.data;
  const users = await db.select().from(usersTable).where(eq(usersTable.email, email)).limit(1);
  if (users.length === 0) {
    res.status(401).json({ error: "Invalid email or password" });
    return;
  }

  const user = users[0]!;
  const valid = await comparePassword(password, user.passwordHash);
  if (!valid) {
    res.status(401).json({ error: "Invalid email or password" });
    return;
  }

  // Ensure existing users have an encryption key
  let encryptionKey = user.encryptionKey;
  if (!encryptionKey) {
    encryptionKey = generateEncryptionKey();
    await db.update(usersTable).set({ encryptionKey }).where(eq(usersTable.id, user.id));
  }

  const token = signToken({ userId: user.id, email: user.email });
  res.json({
    user: { id: user.id, email: user.email, status: user.status, createdAt: user.createdAt.toISOString() },
    token,
    encryptionKey,
  });
});

router.post("/logout", (_req, res) => {
  res.json({ message: "Logged out successfully" });
});

router.get("/me", requireAuth, async (req, res) => {
  const userId = (req as typeof req & { userId: string }).userId;
  const users = await db.select().from(usersTable).where(eq(usersTable.id, userId)).limit(1);
  if (users.length === 0) {
    res.status(401).json({ error: "User not found" });
    return;
  }
  const user = users[0]!;
  res.json({ id: user.id, email: user.email, status: user.status, createdAt: user.createdAt.toISOString() });
});

// Returns the user's encryption key — only for the authenticated user, never exposed in admin routes
router.get("/encryption-key", requireAuth, async (req, res) => {
  const userId = (req as typeof req & { userId: string }).userId;
  const users = await db.select().from(usersTable).where(eq(usersTable.id, userId)).limit(1);
  if (users.length === 0) {
    res.status(401).json({ error: "User not found" });
    return;
  }
  const user = users[0]!;
  let encryptionKey = user.encryptionKey;
  if (!encryptionKey) {
    encryptionKey = crypto.randomBytes(32).toString("base64");
    await db.update(usersTable).set({ encryptionKey }).where(eq(usersTable.id, user.id));
  }
  res.json({ encryptionKey });
});

export default router;
