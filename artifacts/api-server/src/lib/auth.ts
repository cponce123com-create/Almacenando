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

// ---------------------------------------------------------------------------
// Duración del token reducida de 30d → 8h.
// ---------------------------------------------------------------------------
const JWT_EXPIRES_IN = "8h";
const JWT_EXPIRES_SECONDS = 8 * 60 * 60;

// ---------------------------------------------------------------------------
// Blacklist cleanup: removes expired revoked tokens from the DB.
// Runs at startup and every hour so the table stays lean.
// ---------------------------------------------------------------------------
export async function cleanupExpiredTokens(): Promise<void> {
  try {
    await db.delete(revokedTokensTable).where(lt(revokedTokensTable.expiresAt, new Date()));
  } catch {
    // Non-critical — cleanup failure should never block normal operation.
  }
}

// Schedule periodic cleanup every hour (non-blocking).
setInterval(() => void cleanupExpiredTokens(), 60 * 60 * 1000).unref();

export function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, 12);
}

export function comparePassword(password: string, hash: string): Promise<boolean> {
  return bcrypt.compare(password, hash);
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

// ---------------------------------------------------------------------------
// Revoke a token by its JTI — call this on logout or forced session expiry.
// ---------------------------------------------------------------------------
export async function revokeToken(jti: string, expiresAt: Date): Promise<void> {
  try {
    await db.insert(revokedTokensTable).values({ jti, expiresAt }).onConflictDoNothing();
  } catch {
    // Best-effort: if insert fails, token will naturally expire via JWT exp.
  }
}

export type AuthenticatedRequest = Request & {
  userId: string;
  userRole: WarehouseRole;
  userEmail: string;
  jti: string;
  tokenExp: number;
};

// ---------------------------------------------------------------------------
// requireAuth
// 1. Verifies JWT signature and expiration.
// 2. Checks the JTI blacklist (revoked by logout or admin).
// 3. Confirms the account is still active and reads the live role from DB.
// Both DB lookups are parallelized to minimize latency overhead.
// ---------------------------------------------------------------------------
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

    // Parallel: user status check + JTI blacklist check
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
