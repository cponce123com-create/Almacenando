import { describe, it, expect, vi, beforeEach } from "vitest";
import request from "supertest";
import express from "express";
import jwt from "jsonwebtoken";

// ── Hoisted mocks ─────────────────────────────────────────────────────────────
const { dbSelectMock, dbInsertMock, dbUpdateMock, dbDeleteMock, bcryptHashMock, auditLogMock } =
  vi.hoisted(() => ({
    dbSelectMock: vi.fn(),
    dbInsertMock: vi.fn(),
    dbUpdateMock: vi.fn(),
    dbDeleteMock: vi.fn(),
    bcryptHashMock: vi.fn().mockResolvedValue("$2a$12$hashedpw"),
    auditLogMock: vi.fn().mockResolvedValue(undefined),
  }));

vi.mock("@workspace/db", () => ({
  db: {
    select: dbSelectMock,
    insert: dbInsertMock,
    update: dbUpdateMock,
    delete: dbDeleteMock,
  },
  usersTable: {
    id: { name: "id" },
    email: { name: "email" },
    status: { name: "status" },
    role: { name: "role" },
    name: { name: "name" },
    createdAt: { name: "created_at" },
    passwordHash: { name: "password_hash" },
    updatedAt: { name: "updated_at" },
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
    asc: vi.fn(() => ({ _tag: "asc" })),
  };
});

vi.mock("bcryptjs", () => ({
  default: {
    hash: bcryptHashMock,
    compare: vi.fn().mockResolvedValue(true),
  },
}));

vi.mock("../lib/audit.js", () => ({ writeAuditLog: auditLogMock }));

import adminRouter from "../routes/admin-users.js";

// ── Chain builders ────────────────────────────────────────────────────────────

function selectChain(rows: Record<string, unknown>[]) {
  const c: Record<string, unknown> = {};
  c.from = vi.fn(() => c);
  c.where = vi.fn(() => c);
  c.orderBy = vi.fn(() => Promise.resolve(rows));
  c.limit = vi.fn(() => Promise.resolve(rows));
  return c;
}

function insertChain(returning: Record<string, unknown>[]) {
  const c: Record<string, unknown> = {};
  c.values = vi.fn(() => c);
  c.returning = vi.fn(() => Promise.resolve(returning));
  return c;
}

function updateChain(returning: Record<string, unknown>[]) {
  const c: Record<string, unknown> = {};
  c.set = vi.fn(() => c);
  c.where = vi.fn(() => c);
  c.returning = vi.fn(() => Promise.resolve(returning));
  return c;
}

function deleteChain(returning: Record<string, unknown>[]) {
  const c: Record<string, unknown> = {};
  c.where = vi.fn(() => c);
  c.returning = vi.fn(() => Promise.resolve(returning));
  return c;
}

// ── App factory ───────────────────────────────────────────────────────────────

function createApp() {
  const app = express();
  app.use(express.json());
  app.use("/api/admin-users", adminRouter);
  return app;
}

const TEST_SECRET = process.env.SESSION_SECRET!;

function makeToken(role: string, userId = "admin-1") {
  return jwt.sign(
    { tokenType: "access", userId, email: "admin@almacen.com", role, jti: `jti-${role}-${userId}` },
    TEST_SECRET,
    { expiresIn: "1h" }
  );
}

/**
 * requireAuth now runs two parallel db.select queries:
 *   1st → user status check, 2nd → JTI blacklist check
 */
function mockRequireAuth(role = "admin", userId = "admin-1") {
  dbSelectMock
    .mockReturnValueOnce(selectChain([{ status: "active", role }]))
    .mockReturnValueOnce(selectChain([])); // JTI not revoked
}

const existingUser = {
  id: "user-99",
  email: "operario@almacen.com",
  name: "Operario",
  role: "operator",
  status: "active",
  createdAt: new Date("2024-01-01"),
};

// ── Tests ─────────────────────────────────────────────────────────────────────

describe("Admin Users Routes", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    auditLogMock.mockResolvedValue(undefined);
    bcryptHashMock.mockResolvedValue("$2a$12$hashedpw");
  });

  // ── GET / ─────────────────────────────────────────────────────────────────

  describe("GET /api/admin-users", () => {
    it("returns 200 with user list for an admin", async () => {
      mockRequireAuth("admin");
      dbSelectMock.mockReturnValueOnce(selectChain([existingUser]));

      const res = await request(createApp())
        .get("/api/admin-users")
        .set("Authorization", `Bearer ${makeToken("admin")}`);

      expect(res.status).toBe(200);
      expect(Array.isArray(res.body)).toBe(true);
    });

    it("returns 200 with user list for a supervisor", async () => {
      mockRequireAuth("supervisor");
      dbSelectMock.mockReturnValueOnce(selectChain([existingUser]));

      const res = await request(createApp())
        .get("/api/admin-users")
        .set("Authorization", `Bearer ${makeToken("supervisor")}`);

      expect(res.status).toBe(200);
    });

    it("returns 403 when an operator tries to list users", async () => {
      mockRequireAuth("operator");

      const res = await request(createApp())
        .get("/api/admin-users")
        .set("Authorization", `Bearer ${makeToken("operator")}`);

      expect(res.status).toBe(403);
    });
  });

  // ── POST / — create user ──────────────────────────────────────────────────

  describe("POST /api/admin-users", () => {
    const newUserPayload = {
      email: "nuevo@almacen.com",
      name: "Nuevo Usuario",
      password: "Password1!Secure",
      role: "operator",
    };

    it("creates a user when called by an admin", async () => {
      mockRequireAuth("admin");
      dbSelectMock.mockReturnValueOnce(selectChain([])); // email not taken
      dbInsertMock.mockReturnValueOnce(
        insertChain([{ id: "new-1", ...newUserPayload, status: "active", createdAt: new Date() }])
      );

      const res = await request(createApp())
        .post("/api/admin-users")
        .set("Authorization", `Bearer ${makeToken("admin")}`)
        .send(newUserPayload);

      expect(res.status).toBe(201);
      expect(res.body.email).toBe(newUserPayload.email);
      expect(res.body).not.toHaveProperty("passwordHash");
    });

    it("returns 403 when a supervisor tries to create a user", async () => {
      mockRequireAuth("supervisor");

      const res = await request(createApp())
        .post("/api/admin-users")
        .set("Authorization", `Bearer ${makeToken("supervisor")}`)
        .send(newUserPayload);

      expect(res.status).toBe(403);
    });

    it("returns 403 when an operator tries to create a user", async () => {
      mockRequireAuth("operator");

      const res = await request(createApp())
        .post("/api/admin-users")
        .set("Authorization", `Bearer ${makeToken("operator")}`)
        .send(newUserPayload);

      expect(res.status).toBe(403);
    });

    it("returns 409 when the email is already registered", async () => {
      mockRequireAuth("admin");
      dbSelectMock.mockReturnValueOnce(selectChain([{ id: "existing" }])); // email taken

      const res = await request(createApp())
        .post("/api/admin-users")
        .set("Authorization", `Bearer ${makeToken("admin")}`)
        .send(newUserPayload);

      expect(res.status).toBe(409);
      expect(res.body.error).toMatch(/ya está registrado/i);
    });

    it("returns 400 for a password that does not meet requirements", async () => {
      mockRequireAuth("admin");

      const res = await request(createApp())
        .post("/api/admin-users")
        .set("Authorization", `Bearer ${makeToken("admin")}`)
        .send({ ...newUserPayload, password: "weak" });

      expect(res.status).toBe(400);
    });
  });

  // ── DELETE /:id ───────────────────────────────────────────────────────────

  describe("DELETE /api/admin-users/:id", () => {
    it("deletes a user when called by an admin", async () => {
      mockRequireAuth("admin", "admin-1");
      dbDeleteMock.mockReturnValueOnce(deleteChain([{ id: "user-99" }]));

      const res = await request(createApp())
        .delete("/api/admin-users/user-99")
        .set("Authorization", `Bearer ${makeToken("admin", "admin-1")}`);

      expect(res.status).toBe(200);
    });

    it("returns 400 when an admin tries to delete their own account", async () => {
      mockRequireAuth("admin", "admin-1");

      const res = await request(createApp())
        .delete("/api/admin-users/admin-1")
        .set("Authorization", `Bearer ${makeToken("admin", "admin-1")}`);

      expect(res.status).toBe(400);
      expect(res.body.error).toMatch(/propia cuenta/i);
    });

    it("returns 404 when the user does not exist", async () => {
      mockRequireAuth("admin", "admin-1");
      dbDeleteMock.mockReturnValueOnce(deleteChain([]));

      const res = await request(createApp())
        .delete("/api/admin-users/nonexistent")
        .set("Authorization", `Bearer ${makeToken("admin", "admin-1")}`);

      expect(res.status).toBe(404);
    });

    it("returns 403 when a supervisor tries to delete a user", async () => {
      mockRequireAuth("supervisor");

      const res = await request(createApp())
        .delete("/api/admin-users/user-99")
        .set("Authorization", `Bearer ${makeToken("supervisor")}`);

      expect(res.status).toBe(403);
    });
  });
});
