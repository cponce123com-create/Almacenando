import { describe, it, expect, vi, beforeEach } from "vitest";
import request from "supertest";
import express from "express";
import jwt from "jsonwebtoken";

const m = vi.hoisted(() => ({ dbS: vi.fn(), dbI: vi.fn(), dbU: vi.fn(), dbD: vi.fn() }));

vi.mock("@workspace/db", () => ({
  db: { select: m.dbS, insert: m.dbI, update: m.dbU, delete: m.dbD },
  eppMasterTable: { id: { n: "id" }, code: { n: "code" }, name: { n: "name" }, size: { n: "size" }, quantity: { n: "quantity" }, minStock: { n: "min_stock" }, status: { n: "status" }, createdAt: { n: "created_at" } },
  eppDeliveriesTable: { id: { n: "id" }, masterId: { n: "master_id" }, employeeName: { n: "employee_name" }, quantity: { n: "quantity" }, deliveryDate: { n: "delivery_date" } },
  eppChecklistsTable: { id: { n: "id" }, checkDate: { n: "check_date" }, reviewedBy: { n: "reviewed_by" } },
  usersTable: { id: { n: "id" }, status: { n: "status" }, role: { n: "role" } },
  revokedTokensTable: { jti: { n: "jti" }, expiresAt: { n: "expires_at" } },
}));
vi.mock("drizzle-orm", async (o) => ({ ...(await o<any>()), eq: vi.fn(() => ({})), desc: vi.fn(() => ({})) }));
vi.mock("../lib/id.js", () => ({ generateId: () => "mid" }));

import eppRouter from "../routes/epp.js";

function mc(r: Record<string, unknown>[]) {
  const p = Promise.resolve(r);
  const t: any = { then: p.then.bind(p), catch: p.catch.bind(p), finally: p.finally.bind(p), where: () => t, limit: () => t, orderBy: () => t, offset: () => t, returning: () => p };
  return { from: () => t } as any;
}
function a() { m.dbS.mockReturnValueOnce(mc([{ status: "active", role: "admin" }])).mockReturnValueOnce(mc([])); }

function app() {
  const e = express(); e.use(express.json()); e.use("/api/epp", eppRouter); return e;
}
const T = jwt.sign({ userId: "u", email: "t@t.com", role: "admin", jti: "j" }, process.env.SESSION_SECRET!, { expiresIn: "1h" });

describe("EPP API", () => {
  beforeEach(() => vi.clearAllMocks());

  it("401 without auth", async () => expect((await request(app()).get("/api/epp")).status).toBe(401));

  it("GET / returns EPP master list", async () => {
    a(); m.dbS.mockReturnValueOnce(mc([{ id: "1", code: "C-001", name: "Casco", size: "M", quantity: "10", minStock: "5", status: "active" }]));
    const r = await request(app()).get("/api/epp").set("Authorization", `Bearer ${T}`);
    expect(r.status).toBe(200);
  });

  it("GET /deliveries returns deliveries", async () => {
    a(); m.dbS.mockReturnValueOnce(mc([{ id: "1", masterId: "m1", employeeName: "Juan", quantity: "2", deliveryDate: "2024-01-01" }]));
    const r = await request(app()).get("/api/epp/deliveries").set("Authorization", `Bearer ${T}`);
    expect(r.status).toBe(200);
  });

  it("POST / creates EPP item", async () => {
    a();
    m.dbI.mockReturnValue({ values: vi.fn().mockReturnValue({ returning: vi.fn().mockResolvedValue([{ id: "1", code: "C-001", name: "Casco", size: "M", quantity: "10", minStock: "5", status: "active" }]) }) });
    const r = await request(app()).post("/api/epp").set("Authorization", `Bearer ${T}`).send({ code: "C-001", name: "Casco", category: "Protección" });
    expect(r.status).toBe(201);
  });

  it("DELETE /:id removes EPP", async () => {
    a(); m.dbD.mockReturnValue({ where: vi.fn().mockReturnValue({ returning: vi.fn().mockResolvedValue([{ id: "1" }]) }) });
    const r = await request(app()).delete("/api/epp/1").set("Authorization", `Bearer ${T}`);
    expect(r.status).toBe(200);
  });
});
