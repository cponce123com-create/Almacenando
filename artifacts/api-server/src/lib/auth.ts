import jwt from "jsonwebtoken";
import bcrypt from "bcryptjs";
import type { Request, Response, NextFunction } from "express";
import { db, usersTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import type { WarehouseRole } from "@workspace/db";

const jwtSecret = process.env.SESSION_SECRET;
if (!jwtSecret) {
  throw new Error("SESSION_SECRET environment variable is required. Set it in your .env file.");
}
const JWT_SECRET = jwtSecret;

// ---------------------------------------------------------------------------
// Duración del token reducida de 30d → 8h.
// Un turno de trabajo típico dura 8 horas. Si un token es robado,
// el atacante solo tiene una ventana de horas, no un mes entero.
// El usuario simplemente vuelve a iniciar sesión al día siguiente.
// ---------------------------------------------------------------------------
const JWT_EXPIRES_IN = "8h";

export function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, 12);
}

export function comparePassword(password: string, hash: string): Promise<boolean> {
  return bcrypt.compare(password, hash);
}

export function signToken(payload: { userId: string; email: string; role: WarehouseRole }): string {
  return jwt.sign(payload, JWT_SECRET, { expiresIn: JWT_EXPIRES_IN });
}

export function verifyToken(token: string): { userId: string; email: string; role: WarehouseRole } | null {
  try {
    const decoded = jwt.verify(token, JWT_SECRET) as { userId: string; email: string; role: WarehouseRole };
    return decoded;
  } catch {
    return null;
  }
}

export type AuthenticatedRequest = Request & { userId: string; userRole: WarehouseRole; userEmail: string };

// ---------------------------------------------------------------------------
// requireAuth — verifies the JWT then does a lightweight DB check to confirm
// the account is still active and reads the current role from the database.
// This prevents a revoked/demoted user from continuing to act on stale JWT
// permissions for up to the full 8-hour token lifetime.
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

    // Lightweight DB check: confirm the account is still active and retrieve
    // the current role from the source of truth rather than trusting the JWT.
    const rows = await db
      .select({ status: usersTable.status, role: usersTable.role })
      .from(usersTable)
      .where(eq(usersTable.id, payload.userId))
      .limit(1);

    if (rows.length === 0 || rows[0]!.status !== "active") {
      res.status(401).json({ error: "Cuenta desactivada o no encontrada" });
      return;
    }

    const authedReq = req as AuthenticatedRequest;
    authedReq.userId = payload.userId;
    authedReq.userRole = rows[0]!.role; // live role from DB, not from JWT
    authedReq.userEmail = payload.email;
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
