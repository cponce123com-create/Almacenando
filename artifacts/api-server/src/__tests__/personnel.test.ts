import { describe, it, expect, vi, beforeEach } from "vitest";
import request from "supertest";
import express from "express";
import jwt from "jsonwebtoken";

const { dbSelectMock, dbInsertMock, dbUpdateMock, dbDeleteMock } = vi.hoisted(() => ({
  dbSelectMock: vi.fn(), dbInsertMock: vi.fn(), dbUpdateMock: vi.fn(), dbDeleteMock: vi.fn(),
}));

vi.mock("@workspace/db", () => ({
  db: { select: dbSelectMock, insert: dbInsertMock, update: dbUpdateMock, delete: dbDeleteMock },
  personnelTable: { id: { name: "id" }, employeeId: { name: "employee_id" }, name: { name: "name" }, role: { name: "role" }, status: { name: "status" }, warehouse: { name: "warehouse" } },
  usersTable: { id: { name: "id" }, status: { name: "status" }, role: { name: "role" } },
  revokedTokensTable: { jti: { name: "jti" }, expiresAt: { name: "expires_at" } },
}));

vi.mock("drizzle-orm", async (o) => ({ ...(await o<typeof import("drizzle-orm")>()), eq: vi.fn(() => ({})), asc: vi.fn(() => ({})) }));
vi.mock("../lib/id.js", () => ({ generateId: () => "mid" }));

import personnelRouter from "../routes/personnel.js";

function makeChain(rows: Record<string, unknown>[]) {
  const chain: Record<string, unknown> = {};
  chain.from = () => chain;
  chain.where = () => chain;
  chain.limit = () => Promise.resolve(rows);
  chain.orderBy = () => chain;
  chain.offset = () => chain;
  chain.returning = () => Promise.resolve(rows);
  chain.set = () => chain;
  return { from: () => chain } as any;
}
function auth() { dbSelectMock.mockReturnValueOnce(makeChain([{ status: "active", role: "admin" }])).mockReturnValueOnce(makeChain([])); }

function createApp() {
  const app = express(); app.use(express.json()); app.use("/api/personnel", personnelRouter); return app;
}
const TOKEN = jwt.sign({ userId: "u", email: "t@t.com", role: "admin", jti: "j" }, process.env.SESSION_SECRET!, { expiresIn: "1h" });

describe("Personnel API", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns 401 without auth", async () => {
    expect((await request(createApp()).get("/api/personnel")).status).toBe(401);
  });

  it("POST / creates person", async () => {
    dbSelectMock
      .mockReturnValueOnce(makeChain([{ status: "active", role: "admin" }]))
      .mockReturnValueOnce(makeChain([]))
      .mockReturnValueOnce(makeChain([]));
    dbInsertMock.mockReturnValue({ values: vi.fn().mockReturnValue({ returning: vi.fn().mockResolvedValue([{ id: "1", employeeId: "E001", name: "Juan", position: "Operador", department: "Producción", role: "operator", status: "active" }]) }) });
    const r = await request(createApp()).post("/api/personnel").set("Authorization", `Bearer ${TOKEN}`).send({ employeeId: "E001", name: "Juan", position: "Operador", department: "Producción" });
    expect(r.status).toBe(201);
  });

  it("DELETE /:id removes person", async () => {
    dbSelectMock
      .mockReturnValueOnce(makeChain([{ status: "active", role: "admin" }]))
      .mockReturnValueOnce(makeChain([]))
      .mockReturnValueOnce(makeChain([]));
    dbDeleteMock.mockReturnValue({ where: vi.fn().mockReturnValue({ returning: vi.fn().mockResolvedValue([{ id: "1" }]) }) });
    const r = await request(createApp()).delete("/api/personnel/1").set("Authorization", `Bearer ${TOKEN}`);
    expect(r.status).toBe(200);
  });

  it("DELETE /:id returns 404 for non-existent", async () => {
    dbSelectMock
      .mockReturnValueOnce(makeChain([{ status: "active", role: "admin" }]))
      .mockReturnValueOnce(makeChain([]))
      .mockReturnValueOnce(makeChain([]));
    dbDeleteMock.mockReturnValue({ where: vi.fn().mockReturnValue({ returning: vi.fn().mockResolvedValue([]) }) });
    const r = await request(createApp()).delete("/api/personnel/nonexistent").set("Authorization", `Bearer ${TOKEN}`);
    expect(r.status).toBe(404);
  });
});
