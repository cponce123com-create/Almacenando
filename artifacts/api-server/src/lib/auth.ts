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

const ACCESS_TOKEN_EXPIRES_IN = 15 * 60; // 15 minutes
const REFRESH_TOKEN_EXPIRES_IN = 7 * 24 * 60 * 60; // 7 days

export async function cleanupExpiredTokens(): Promise<void> {
  try {
    await db.delete(revokedTokensTable).where(lt(revokedTokensTable.expiresAt, new Date()));
  } catch {
    // Non-critical — cleanup failure should never block normal operation.
  }
}

setInterval(() => void cleanupExpiredTokens(), 60 * 60 * 1000).unref();

/**
 * Hashea una contraseña con bcrypt (12 rounds).
 * @param password - Contraseña en texto plano.
 * @returns Hash de la contraseña.
 */
export function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, 12);
}

export function comparePassword(password: string, hash: string): Promise<boolean> {
  return bcrypt.compare(password, hash);
}

/**
 * Firma un access token de corta duración (15 min).
 */
export function signToken(payload: { userId: string; email: string; role: WarehouseRole }): string {
  return signAccessToken(payload);
}

/**
 * Firma un access token de corta duración (15 min).
 */
export function signAccessToken(payload: { userId: string; email: string; role: WarehouseRole }): string {
  const jti = randomUUID();
  return jwt.sign({ ...payload, jti, tokenType: "access" }, JWT_SECRET, { expiresIn: ACCESS_TOKEN_EXPIRES_IN });
}

/**
 * Firma un refresh token de larga duración (7 días).
 */
export function signRefreshToken(payload: { userId: string; email: string; role: WarehouseRole }): string {
  const jti = randomUUID();
  return jwt.sign({ ...payload, jti, tokenType: "refresh" }, JWT_SECRET, { expiresIn: REFRESH_TOKEN_EXPIRES_IN });
}

type TokenPayload = { userId: string; email: string; role: WarehouseRole; jti: string; tokenType: string; exp: number };

export function verifyToken(token: string): TokenPayload | null {
  try {
    return jwt.verify(token, JWT_SECRET) as TokenPayload;
  } catch {
    return null;
  }
}

/**
 * Verifica que el token sea un refresh token válido.
 */
export function verifyRefreshToken(token: string): TokenPayload | null {
  const payload = verifyToken(token);
  if (!payload || payload.tokenType !== "refresh") return null;
  return payload;
}

// ---------------------------------------------------------------------------
// Revoke a token — propagates errors so logout failures surface as 500.
// ---------------------------------------------------------------------------
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

export async function requireAuth(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      res.status(401).json({ error: "No autorizado" });
      return;
    }

    const token = authHeader.substring(7);
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
    authedReq.userRole = userRows[0]!.role as AuthenticatedRequest["userRole"];
    authedReq.userEmail = payload.email;
    authedReq.jti = payload.jti;
    authedReq.tokenExp = payload.exp;
    next();
  } catch (err) {
    next(err);
  }
}

/**
 * Middleware de autorización por rol.
 * Verifica que el usuario autenticado tenga uno de los roles especificados.
 * Responde 403 si el rol es insuficiente.
 * @param roles - Roles permitidos (ej: "admin", "supervisor").
 */
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
