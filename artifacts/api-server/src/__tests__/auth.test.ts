import { describe, it, expect, vi, beforeEach } from "vitest";
import request from "supertest";
import express from "express";
import jwt from "jsonwebtoken";

// ── Hoisted mock refs ────────────────────────────────────────────────────────
// vi.hoisted runs before module evaluation, giving us stable references that
// can be used inside vi.mock factories and imported test code alike.
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
}));

// Spread the real drizzle-orm but replace SQL-building helpers so they don't
// try to introspect our stub column objects.
vi.mock("drizzle-orm", async (importOriginal) => {
  const real = await importOriginal<typeof import("drizzle-orm")>();
  return {
    ...real,
    eq: vi.fn(() => ({ _tag: "eq" })),
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

/** Build a chainable Drizzle-lookalike that resolves to `rows` on .limit() */
function makeChain(rows: Record<string, unknown>[]) {
  const chain: Record<string, unknown> = {};
  chain.from = vi.fn(() => chain);
  chain.where = vi.fn(() => chain);
  chain.limit = vi.fn(() => Promise.resolve(rows));
  return chain as { from: ReturnType<typeof vi.fn>; where: ReturnType<typeof vi.fn>; limit: ReturnType<typeof vi.fn> };
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

// ── Tests ─────────────────────────────────────────────────────────────────────

describe("Auth Routes", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Re-apply the audit log no-op after clearAllMocks resets it
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
      // Sensitive field must never be exposed
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

  // ── GET /api/auth/me  (token verification) ────────────────────────────────

  describe("GET /api/auth/me", () => {
    it("returns 200 with current user data for a valid token", async () => {
      const token = jwt.sign(
        { userId: mockUser.id, email: mockUser.email, role: mockUser.role },
        TEST_SECRET,
        { expiresIn: "1h" }
      );

      // requireAuth performs one DB check; the route handler performs another.
      dbSelectMock
        .mockReturnValueOnce(makeChain([{ status: "active", role: "operator" }]))
        .mockReturnValueOnce(makeChain([mockUser]));

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

    it("returns 401 when the DB check finds the user is no longer active", async () => {
      const token = jwt.sign(
        { userId: mockUser.id, email: mockUser.email, role: mockUser.role },
        TEST_SECRET,
        { expiresIn: "1h" }
      );

      // requireAuth DB check returns an inactive user
      dbSelectMock.mockReturnValueOnce(makeChain([{ status: "inactive", role: "operator" }]));

      const res = await request(createApp())
        .get("/api/auth/me")
        .set("Authorization", `Bearer ${token}`);

      expect(res.status).toBe(401);
    });
  });
});
