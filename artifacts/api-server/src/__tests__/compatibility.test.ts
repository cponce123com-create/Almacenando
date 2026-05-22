import { describe, it, expect, vi, beforeEach } from "vitest";
import request from "supertest";
import express from "express";
import jwt from "jsonwebtoken";

const { dbSelectMock } = vi.hoisted(() => ({ dbSelectMock: vi.fn() }));

vi.mock("@workspace/db", () => ({
  db: { select: dbSelectMock },
  productsTable: {
    id: { name: "id" }, code: { name: "code" }, name: { name: "name" },
    category: { name: "category" }, status: { name: "status" },
  },
  usersTable: { id: { name: "id" }, status: { name: "status" }, role: { name: "role" } },
  revokedTokensTable: { jti: { name: "jti" }, expiresAt: { name: "expires_at" } },
}));

vi.mock("drizzle-orm", async (importOriginal) => {
  const real = await importOriginal<typeof import("drizzle-orm")>();
  return { ...real, eq: vi.fn(() => ({ _tag: "eq" })) };
});

import compatibilityRouter from "../routes/compatibility.js";

function makeChain(rows: Record<string, unknown>[]) {
  const p = Promise.resolve(rows);
  const t = { then: p.then.bind(p), catch: p.catch.bind(p), finally: p.finally.bind(p),
    where: () => t, limit: () => t, from: () => t };
  return { from: () => t } as unknown as { from: () => typeof t };
}

function setUser() {
  dbSelectMock.mockReturnValueOnce(makeChain([{ status: "active", role: "admin" }]))
    .mockReturnValueOnce(makeChain([]));
}

function createApp() {
  const app = express();
  app.use(express.json());
  app.use("/api/compatibility", compatibilityRouter);
  return app;
}

const TEST_SECRET = process.env.SESSION_SECRET!;
function makeToken() {
  return jwt.sign({ userId: "u1", email: "t@t.com", role: "admin", jti: "j" }, TEST_SECRET, { expiresIn: "1h" });
}

describe("Compatibility API", () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it("returns 401 without auth", async () => {
    const res = await request(createApp()).post("/api/compatibility/ai-analyze");
    expect(res.status).toBe(401);
  });

  it("returns 400 without name field", async () => {
    setUser();
    const res = await request(createApp())
      .post("/api/compatibility/ai-analyze")
      .set("Authorization", `Bearer ${makeToken()}`)
      .send({});
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/name/);
  });
});
