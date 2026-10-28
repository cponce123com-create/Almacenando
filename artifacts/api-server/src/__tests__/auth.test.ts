import { describe, it, expect, vi, beforeEach } from "vitest";
import request from "supertest";
import express from "express";
import jwt from "jsonwebtoken";

// ── Hoisted mock refs ────────────────────────────────────────────────────────
const { dbSelectMock, bcryptCompareMock, auditLogMock } = vi.hoisted(() => ({
  dbSelectMock: vi.fn(),
  bcryptCompareMock: vi.fn(),
  auditLogMock: vi.fn().mockResolvedValue(undefined),
}));

// ── Module mocks ─────────────────────────────────────────────────────────────

vi.mock("@workspace/db", () => ({
  db: { select: dbSelectMock },
  usersTable: {
    id: { name: "id" },
    email: { name: "email" },
    status: { name: "status" },
    role: { name: "role" },
    name: { name: "name" },
    createdAt: { name: "created_at" },
    passwordHash: { name: "password_hash" },
  },
  revokedTokensTable: {
    jti: { name: "jti" },
    expiresAt: { name: "expires_at" },
  },
}));

vi.mock("drizzle-orm", async (importOriginal) => {
  const real = await importOriginal<typeof import("drizzle-orm")>();
  return {
    ...real,
    eq: vi.fn(() => ({ _tag: "eq" })),
    lt: vi.fn(() => ({ _tag: "lt" })),
    and: vi.fn(() => ({ _tag: "and" })),
    desc: vi.fn(() => ({ _tag: "desc" })),
  };
});

vi.mock("bcryptjs", () => ({
  default: {
    compare: bcryptCompareMock,
    hash: vi.fn().mockResolvedValue("$2a$12$mockhash"),
  },
}));

vi.mock("../lib/audit.js", () => ({
  writeAuditLog: auditLogMock,
}));

// ── Imports (after mocks are hoisted) ────────────────────────────────────────

import authRouter from "../routes/auth.js";

// ── Helpers ───────────────────────────────────────────────────────────────────

/**
 * Build a chainable Drizzle-lookalike that resolves to `rows` on .limit().
 * Also handles .delete().where() chains used by revokeToken cleanup.
 */
function makeChain(rows: Record<string, unknown>[]) {
  const chain: Record<string, unknown> = {};
  chain.from = vi.fn(() => chain);
  chain.where = vi.fn(() => chain);
  chain.limit = vi.fn(() => Promise.resolve(rows));
  return chain as {
    from: ReturnType<typeof vi.fn>;
    where: ReturnType<typeof vi.fn>;
    limit: ReturnType<typeof vi.fn>;
  };
}

/**
 * requireAuth now runs TWO parallel db.select calls:
 *   1st → user status check
 *   2nd → revoked-token (JTI blacklist) check
 * Use this helper to set both up in one call.
 */
function mockRequireAuth(
  userRow: Record<string, unknown> = { status: "active", role: "operator" },
  revokedRows: Record<string, unknown>[] = []
) {
  dbSelectMock
    .mockReturnValueOnce(makeChain([userRow]))   // user status
    .mockReturnValueOnce(makeChain(revokedRows)); // blacklist
}

function createApp() {
  const app = express();
  app.use(express.json());
  app.use("/api/auth", authRouter);
  return app;
}

const TEST_SECRET = process.env.SESSION_SECRET!;

const mockUser = {
  id: "user-1",
  email: "operario@almacen.com",
  name: "Operario Test",
  passwordHash: "$2a$12$mockhash",
  role: "operator",
  status: "active",
  createdAt: new Date("2024-01-01T00:00:00.000Z"),
};

function makeToken(overrides: Record<string, unknown> = {}) {
  return jwt.sign(
    { tokenType: "access", userId: mockUser.id, email: mockUser.email, role: mockUser.role, jti: "test-jti-1", ...overrides },
    TEST_SECRET,
    { expiresIn: "1h" }
  );
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe("Auth Routes", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    auditLogMock.mockResolvedValue(undefined);
  });

  // ── POST /api/auth/login ──────────────────────────────────────────────────

  describe("POST /api/auth/login", () => {
    it("returns 200 with a signed token on successful login", async () => {
      dbSelectMock.mockReturnValue(makeChain([mockUser]));
      bcryptCompareMock.mockResolvedValue(true);

      const res = await request(createApp())
        .post("/api/auth/login")
        .send({ email: mockUser.email, password: "Password123!" });

      expect(res.status).toBe(200);
      expect(res.body.token).toEqual(expect.any(String));
      expect(res.body.user.email).toBe(mockUser.email);
      expect(res.body.user.role).toBe("operator");
      expect(res.body.user).not.toHaveProperty("passwordHash");
    });

    it("returns 401 for incorrect password", async () => {
      dbSelectMock.mockReturnValue(makeChain([mockUser]));
      bcryptCompareMock.mockResolvedValue(false);

      const res = await request(createApp())
        .post("/api/auth/login")
        .send({ email: mockUser.email, password: "wrong-password" });

      expect(res.status).toBe(401);
      expect(res.body.error).toBe("Correo o contraseña incorrectos");
    });

    it("returns 401 when the account is inactive", async () => {
      dbSelectMock.mockReturnValue(makeChain([{ ...mockUser, status: "inactive" }]));

      const res = await request(createApp())
        .post("/api/auth/login")
        .send({ email: mockUser.email, password: "Password123!" });

      expect(res.status).toBe(401);
      expect(res.body.error).toMatch(/desactivada/i);
    });

    it("returns 401 for an unknown email", async () => {
      dbSelectMock.mockReturnValue(makeChain([]));

      const res = await request(createApp())
        .post("/api/auth/login")
        .send({ email: "nobody@almacen.com", password: "Password123!" });

      expect(res.status).toBe(401);
    });
  });

  // ── GET /api/auth/me ─────────────────────────────────────────────────────

  describe("GET /api/auth/me", () => {
    it("returns 200 with current user data for a valid token", async () => {
      const token = makeToken();
      // requireAuth: user check + blacklist check (in that order via Promise.all)
      mockRequireAuth({ status: "active", role: "operator" });
      // route handler: fetch full user record
      dbSelectMock.mockReturnValueOnce(makeChain([mockUser]));

      const res = await request(createApp())
        .get("/api/auth/me")
        .set("Authorization", `Bearer ${token}`);

      expect(res.status).toBe(200);
      expect(res.body.email).toBe(mockUser.email);
      expect(res.body.role).toBe("operator");
      expect(res.body).not.toHaveProperty("passwordHash");
    });

    it("returns 401 when no Authorization header is present", async () => {
      const res = await request(createApp()).get("/api/auth/me");
      expect(res.status).toBe(401);
    });

    it("returns 401 for a malformed or expired token", async () => {
      const res = await request(createApp())
        .get("/api/auth/me")
        .set("Authorization", "Bearer not.a.real.jwt");
      expect(res.status).toBe(401);
    });

    it("rejects a valid refresh token when used as a bearer access token", async () => {
      const token = makeToken({ tokenType: "refresh" });
      const res = await request(createApp())
        .get("/api/auth/me")
        .set("Authorization", `Bearer ${token}`);
      expect(res.status).toBe(401);
    });

    it("returns 401 when the DB check finds the user is no longer active", async () => {
      const token = makeToken();
      mockRequireAuth({ status: "inactive", role: "operator" });

      const res = await request(createApp())
        .get("/api/auth/me")
        .set("Authorization", `Bearer ${token}`);

      expect(res.status).toBe(401);
    });

    it("returns 401 when the token JTI has been revoked (logged out)", async () => {
      const token = makeToken({ jti: "revoked-jti" });
      // user check returns active, but blacklist returns a match
      dbSelectMock
        .mockReturnValueOnce(makeChain([{ status: "active", role: "operator" }]))
        .mockReturnValueOnce(makeChain([{ jti: "revoked-jti" }]));

      const res = await request(createApp())
        .get("/api/auth/me")
        .set("Authorization", `Bearer ${token}`);

      expect(res.status).toBe(401);
      expect(res.body.error).toMatch(/sesión cerrada/i);
    });
  });
});
