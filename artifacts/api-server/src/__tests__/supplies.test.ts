import { describe, it, expect, vi, beforeEach } from "vitest";
import request from "supertest";
import express from "express";
import jwt from "jsonwebtoken";

// ── Hoisted mocks ─────────────────────────────────────────────────────────────
const { dbSelectMock, dbInsertMock, dbUpdateMock, dbDeleteMock } = vi.hoisted(() => ({
  dbSelectMock: vi.fn(),
  dbInsertMock: vi.fn(),
  dbUpdateMock: vi.fn(),
  dbDeleteMock: vi.fn(),
}));

vi.mock("@workspace/db", () => ({
  db: {
    select: dbSelectMock,
    insert: dbInsertMock,
    update: dbUpdateMock,
    delete: dbDeleteMock,
  },
  suppliesTable: {
    id: { name: "id" },
    code: { name: "code" },
    description: { name: "description" },
    unit: { name: "unit" },
    status: { name: "status" },
    createdAt: { name: "created_at" },
    updatedAt: { name: "updated_at" },
  },
  usersTable: {
    id: { name: "id" },
    status: { name: "status" },
    role: { name: "role" },
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
    asc: vi.fn(() => ({ _tag: "asc" })),
  };
});

vi.mock("../lib/id.js", () => ({ generateId: () => "mock-id" }));

import suppliesRouter from "../routes/supplies.js";

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeChain(rows: Record<string, unknown>[]) {
  const promise = Promise.resolve(rows);
  const term: Record<string, unknown> & PromiseLike<Record<string, unknown>[]> = {
    then: promise.then.bind(promise),
    catch: promise.catch.bind(promise),
    finally: promise.finally.bind(promise),
    where: () => term,
    orderBy: () => term,
    limit: () => term,
    offset: () => term,
    returning: () => promise,
  };
  const select: Record<string, () => unknown> & { from: () => typeof term } = {
    from: () => term,
  };
  return select as unknown as { from: () => typeof term };
}

function setCurrentUser(role = "operator") {
  dbSelectMock
    .mockReturnValueOnce(makeChain([{ status: "active", role }]))
    .mockReturnValueOnce(makeChain([]));
}

function createApp() {
  const app = express();
  app.use(express.json());
  app.use("/api/supplies", suppliesRouter);
  return app;
}

const TEST_SECRET = process.env.SESSION_SECRET!;
function makeToken(role = "operator") {
  return jwt.sign(
    { userId: "user-1", email: "test@test.com", role, jti: `jti-${Date.now()}` },
    TEST_SECRET,
    { expiresIn: "1h" },
  );
}

describe("Supplies API", () => {
  beforeEach(() => { vi.clearAllMocks(); });

  describe("GET /api/supplies", () => {
    it("returns 401 without auth", async () => {
      const res = await request(createApp()).get("/api/supplies");
      expect(res.status).toBe(401);
    });

    it("returns empty list", async () => {
      setCurrentUser();
      dbSelectMock.mockReturnValueOnce(makeChain([]));
      const res = await request(createApp())
        .get("/api/supplies")
        .set("Authorization", `Bearer ${makeToken()}`);
      expect(res.status).toBe(200);
      expect(res.body).toEqual([]);
    });

    it("returns supply list", async () => {
      setCurrentUser();
      dbSelectMock.mockReturnValueOnce(makeChain([
        { id: "s1", code: "S-001", description: "Supply A", unit: "kg", status: "active" },
      ]));
      const res = await request(createApp())
        .get("/api/supplies")
        .set("Authorization", `Bearer ${makeToken()}`);
      expect(res.status).toBe(200);
      expect(res.body).toHaveLength(1);
      expect(res.body[0].code).toBe("S-001");
    });
  });

  describe("POST /api/supplies", () => {
    it("creates a supply", async () => {
      setCurrentUser("admin");
      dbSelectMock.mockReturnValueOnce(makeChain([])); // duplicate check
      dbInsertMock.mockReturnValue({
        values: vi.fn().mockReturnValue({
          returning: vi.fn().mockResolvedValue([{
            id: "s1", code: "S-001", description: "New Supply", unit: "kg", status: "active",
          }]),
        }),
      });
      const res = await request(createApp())
        .post("/api/supplies")
        .set("Authorization", `Bearer ${makeToken("admin")}`)
        .send({ code: "S-001", description: "New Supply", unit: "kg" });
      expect(res.status).toBe(201);
    });

    it("rejects duplicate code", async () => {
      setCurrentUser("admin");
      dbSelectMock.mockReturnValueOnce(makeChain([{ id: "existing" }]));
      const res = await request(createApp())
        .post("/api/supplies")
        .set("Authorization", `Bearer ${makeToken("admin")}`)
        .send({ code: "S-001", description: "Dup", unit: "kg" });
      expect(res.status).toBe(409);
    });
  });

  describe("DELETE /api/supplies/:id", () => {
    it("deletes existing supply", async () => {
      setCurrentUser("admin");
      dbUpdateMock.mockReturnValue({
        set: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            returning: vi.fn().mockResolvedValue([{ id: "s1" }]),
          }),
        }),
      });
      dbDeleteMock.mockReturnValue({
        where: vi.fn().mockReturnValue({
          returning: vi.fn().mockResolvedValue([{ id: "s1" }]),
        }),
      });
      const res = await request(createApp())
        .delete("/api/supplies/s1")
        .set("Authorization", `Bearer ${makeToken("admin")}`);
      expect(res.status).toBe(200);
    });
  });
});
