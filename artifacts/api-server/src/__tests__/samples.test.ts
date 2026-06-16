process.env.SESSION_SECRET = "test-secret-for-ci";

import { describe, it, expect, vi, beforeEach } from "vitest";
import request from "supertest";
import express from "express";
import jwt from "jsonwebtoken";

const m = vi.hoisted(() => ({ dbS: vi.fn(), dbI: vi.fn(), dbU: vi.fn(), dbD: vi.fn() }));

vi.mock("@workspace/db", () => ({
  db: { select: m.dbS, insert: m.dbI, update: m.dbU, delete: m.dbD },
  samplesTable: { id: { n: "id" }, productId: { n: "product_id" }, sampleCode: { n: "sample_code" }, quantity: { n: "quantity" }, purpose: { n: "purpose" }, status: { n: "status" }, sampleDate: { n: "sample_date" } },
  usersTable: { id: { n: "id" }, status: { n: "status" }, role: { n: "role" } },
  revokedTokensTable: { jti: { n: "jti" }, expiresAt: { n: "expires_at" } },
}));
vi.mock("drizzle-orm", async (o) => ({ ...(await o<any>()), eq: vi.fn(() => ({})), desc: vi.fn(() => ({})) }));
vi.mock("../lib/id.js", () => ({ generateId: () => "mid" }));
vi.mock("../lib/validate-mime.js", () => ({ validateMimeType: vi.fn() }));

import samplesRouter from "../routes/samples.js";

function mc(r: Record<string, unknown>[]) {
  const chain: Record<string, unknown> = {};
  chain.from = () => chain;
  chain.where = () => chain;
  chain.limit = () => Promise.resolve(r);
  chain.orderBy = () => chain;
  chain.offset = () => chain;
  chain.returning = () => Promise.resolve(r);
  chain.set = () => chain;
  return { from: () => chain } as any;
}
// Helper: set up requireAuth mocks (2 db.select calls) + optional extra route mocks
function auth(n = 0) {
  m.dbS.mockReturnValueOnce(mc([{ status: "active", role: "admin" }]));
  m.dbS.mockReturnValueOnce(mc([]));
  for (let i = 0; i < n; i++) m.dbS.mockReturnValueOnce(mc([]));
}
function app() { const e = express(); e.use(express.json()); e.use("/api/samples", samplesRouter); return e; }
const T = jwt.sign({ userId: "u", email: "t@t.com", role: "admin", jti: "j" }, process.env.SESSION_SECRET!, { expiresIn: "1h" });

describe("Samples API", () => {
  beforeEach(() => vi.clearAllMocks());

  it("401 without auth", async () => expect((await request(app()).get("/api/samples")).status).toBe(401));

  it("GET / returns samples list", async () => {
    auth(1); // 2 for auth + 1 for route
    const r = await request(app()).get("/api/samples").set("Authorization", `Bearer ${T}`);
    expect(r.status).toBe(200);
  });

  it("POST / creates sample", async () => {
    auth(1); // 2 for auth + 1 for route
    m.dbI.mockReturnValue({ values: vi.fn().mockReturnValue({ returning: vi.fn().mockResolvedValue([{ id: "1", sampleCode: "S-001", productId: "p1", quantity: "1", purpose: "Test", status: "pending", sampleDate: "2024-01-01" }]) }) });
    const r = await request(app()).post("/api/samples").set("Authorization", `Bearer ${T}`).send({ productId: "p1", sampleCode: "S-001", quantity: "1", purpose: "Test", sampleDate: "2024-01-01" });
    expect(r.status).toBe(201);
  });

  it("DELETE /:id removes sample", async () => {
    auth(0); // 2 for auth, no route select
    m.dbD.mockReturnValue({ where: vi.fn().mockReturnValue({ returning: vi.fn().mockResolvedValue([{ id: "1" }]) }) });
    const r = await request(app()).delete("/api/samples/1").set("Authorization", `Bearer ${T}`);
    expect(r.status).toBe(200);
  });
});
