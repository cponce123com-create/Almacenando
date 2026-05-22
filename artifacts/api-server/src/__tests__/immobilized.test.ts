import { describe, it, expect, vi, beforeEach } from "vitest";
import request from "supertest";
import express from "express";
import jwt from "jsonwebtoken";

const m = vi.hoisted(() => ({ dbS: vi.fn(), dbI: vi.fn(), dbU: vi.fn(), dbD: vi.fn() }));

vi.mock("@workspace/db", () => ({
  db: { select: m.dbS, insert: m.dbI, update: m.dbU, delete: m.dbD },
  immobilizedProductsTable: { id: { n: "id" }, productId: { n: "product_id" }, quantity: { n: "quantity" }, reason: { n: "reason" }, status: { n: "status" }, immobilizedDate: { n: "immobilized_date" } },
  productsTable: { id: { n: "id" }, code: { n: "code" }, name: { n: "name" }, status: { n: "status" } },
  usersTable: { id: { n: "id" }, status: { n: "status" }, role: { n: "role" } },
  revokedTokensTable: { jti: { n: "jti" }, expiresAt: { n: "expires_at" } },
}));
vi.mock("drizzle-orm", async (o) => ({ ...(await o<any>()), eq: vi.fn(() => ({})), desc: vi.fn(() => ({})) }));
vi.mock("../lib/id.js", () => ({ generateId: () => "mid" }));

import immobilizedRouter from "../routes/immobilized.js";

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
function auth(n = 0) {
  m.dbS.mockReturnValueOnce(mc([{ status: "active", role: "admin" }]));
  m.dbS.mockReturnValueOnce(mc([]));
  for (let i = 0; i < n; i++) m.dbS.mockReturnValueOnce(mc([]));
}
function app() { const e = express(); e.use(express.json()); e.use("/api/immobilized", immobilizedRouter); return e; }
const T = jwt.sign({ userId: "u", email: "t@t.com", role: "admin", jti: "j" }, process.env.SESSION_SECRET!, { expiresIn: "1h" });

describe("Immobilized API", () => {
  beforeEach(() => vi.clearAllMocks());

  it("401 without auth", async () => expect((await request(app()).get("/api/immobilized")).status).toBe(401));

  it("GET / returns list", async () => {
    auth(1);
    const r = await request(app()).get("/api/immobilized").set("Authorization", `Bearer ${T}`);
    expect(r.status).toBe(200);
  });

  it("POST / creates item", async () => {
    auth(1);
    m.dbI.mockReturnValue({ values: vi.fn().mockReturnValue({ returning: vi.fn().mockResolvedValue([{ id: "1", productId: "p1", quantity: "5", reason: "Test reason", status: "immobilized", immobilizedDate: "2024-01-01" }]) }) });
    const r = await request(app()).post("/api/immobilized").set("Authorization", `Bearer ${T}`).send({ productId: "p1", quantity: 5, reason: "Test reason" });
    expect(r.status).toBe(201);
  });

  it("DELETE /:id removes item", async () => {
    auth(0);
    m.dbD.mockReturnValue({ where: vi.fn().mockReturnValue({ returning: vi.fn().mockResolvedValue([{ id: "1" }]) }) });
    const r = await request(app()).delete("/api/immobilized/1").set("Authorization", `Bearer ${T}`);
    expect(r.status).toBe(200);
  });
});
