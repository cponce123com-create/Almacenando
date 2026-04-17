import jwt from "jsonwebtoken";
import bcrypt from "bcryptjs";
import { randomUUID } from "crypto";
import type { Request, Response, NextFunction } from "express";
import { db, usersTable, revokedTokensTable } from "@workspace/db";
import { eq, lt } from "drizzle-orm";
import type { WarehouseRole } from "@workspace/db";

const jwtSecret = process.env.SESSION_SECRET;
if (!jwtSecret) {
  throw new Error("SESSION_SECRET environment variable is required. Set it in your .env file.");
}
const JWT_SECRET = jwtSecret;

export const JWT_EXPIRES_IN = "8h";
export const JWT_EXPIRES_SECONDS = 8 * 60 * 60;

/** Nombre de la cookie que lleva el JWT de sesión (httpOnly). */
export const AUTH_COOKIE_NAME = "auth_token";

/** Opciones estándar para la cookie de sesión. */
export function getAuthCookieOptions() {
  const isProduction = process.env.NODE_ENV === "production";
  return {
    httpOnly: true,
    secure: isProduction,
    sameSite: "strict" as const,
    maxAge: JWT_EXPIRES_SECONDS * 1000,
    path: "/",
  };
}

export async function cleanupExpiredTokens(): Promise<void> {
  try {
    await db.delete(revokedTokensTable).where(lt(revokedTokensTable.expiresAt, new Date()));
  } catch {
    // Non-critical — cleanup failure should never block normal operation.
  }
}

// En tests no queremos un setInterval huérfano.
if (process.env.NODE_ENV !== "test") {
  setInterval(() => void cleanupExpiredTokens(), 60 * 60 * 1000).unref();
}

export function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, 12);
}

export function comparePassword(password: string, hash: string): Promise<boolean> {
  return bcrypt.compare(password, hash);
}

/**
 * Hash dummy precalculado (ver abajo). Se usa para igualar tiempos de login
 * cuando el email no existe, evitando enumeración por timing attack.
 * El valor corresponde a bcrypt.hashSync("dummy-password-for-timing", 12).
 */
const DUMMY_HASH = "$2a$12$CwTycUXWue0Thq9StjUM0uJ8nFVxkq/zQR7oRsMCYXjB3FvkLaOxu";

/**
 * Compara contra un hash dummy para simular el costo de bcrypt.compare
 * cuando el usuario no existe. No revela nada útil al atacante.
 */
export function dummyCompare(password: string): Promise<boolean> {
  return bcrypt.compare(password, DUMMY_HASH);
}

export function signToken(payload: { userId: string; email: string; role: WarehouseRole }): string {
  const jti = randomUUID();
  return jwt.sign({ ...payload, jti }, JWT_SECRET, { expiresIn: JWT_EXPIRES_IN });
}

type TokenPayload = { userId: string; email: string; role: WarehouseRole; jti: string; exp: number };

export function verifyToken(token: string): TokenPayload | null {
  try {
    return jwt.verify(token, JWT_SECRET) as TokenPayload;
  } catch {
    return null;
  }
}

export async function revokeToken(jti: string, expiresAt: Date): Promise<void> {
  await db.insert(revokedTokensTable).values({ jti, expiresAt }).onConflictDoNothing();
}

export type AuthenticatedRequest = Request & {
  userId: string;
  userRole: WarehouseRole;
  userEmail: string;
  jti: string;
  tokenExp: number;
};

/**
 * Extrae el JWT desde la cookie httpOnly (preferido) o, como fallback
 * para compatibilidad durante la migración, desde el header Authorization.
 */
function extractToken(req: Request): string | null {
  // Cookie httpOnly (preferido — requiere cookie-parser).
  const cookieToken = (req as Request & { cookies?: Record<string, string> }).cookies?.[AUTH_COOKIE_NAME];
  if (cookieToken) return cookieToken;

  // Fallback: header Authorization Bearer (compatibilidad temporal).
  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith("Bearer ")) {
    return authHeader.substring(7);
  }

  return null;
}

export async function requireAuth(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const token = extractToken(req);
    if (!token) {
      res.status(401).json({ error: "No autorizado" });
      return;
    }

    const payload = verifyToken(token);
    if (!payload) {
      res.status(401).json({ error: "Token inválido o expirado" });
      return;
    }

    const [userRows, revokedRows] = await Promise.all([
      db
        .select({ status: usersTable.status, role: usersTable.role })
        .from(usersTable)
        .where(eq(usersTable.id, payload.userId))
        .limit(1),
      db
        .select({ jti: revokedTokensTable.jti })
        .from(revokedTokensTable)
        .where(eq(revokedTokensTable.jti, payload.jti))
        .limit(1),
    ]);

    if (revokedRows.length > 0) {
      res.status(401).json({ error: "Sesión cerrada. Inicia sesión nuevamente." });
      return;
    }

    if (userRows.length === 0 || userRows[0]!.status !== "active") {
      res.status(401).json({ error: "Cuenta desactivada o no encontrada" });
      return;
    }

    const authedReq = req as AuthenticatedRequest;
    authedReq.userId = payload.userId;
    authedReq.userRole = userRows[0]!.role;
    authedReq.userEmail = payload.email;
    authedReq.jti = payload.jti;
    authedReq.tokenExp = payload.exp;
    next();
  } catch (err) {
    next(err);
  }
}

export function requireRole(...roles: WarehouseRole[]) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const authedReq = req as AuthenticatedRequest;
    if (!authedReq.userId) {
      res.status(401).json({ error: "No autorizado" });
      return;
    }
    if (!roles.includes(authedReq.userRole)) {
      res.status(403).json({ error: "Acceso denegado: rol insuficiente" });
      return;
    }
    next();
  };
}
