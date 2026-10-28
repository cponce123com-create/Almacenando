import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import request from "supertest";
import express, { type Request, type Response, type NextFunction } from "express";

const { dbMock } = vi.hoisted(() => ({
  dbMock: {
    insert: vi.fn(),
    update: vi.fn(),
    select: vi.fn(),
    transaction: vi.fn(),
  },
}));

vi.mock("@workspace/db", () => ({
  db: dbMock,
  balanceSyncRunsTable: {
    id: { name: "id" }, status: { name: "status" }, requestedAt: { name: "requested_at" },
    claimedAt: { name: "claimed_at" }, requestedBy: { name: "requested_by" }, extractedAt: { name: "extracted_at" },
    completedAt: { name: "completed_at" }, recordCount: { name: "record_count" }, errorMessage: { name: "error_message" },
    payload: { name: "payload" }, summary: { name: "summary" },
  },
  productsTable: {
    warehouse: { name: "warehouse" }, code: { name: "code" }, type: { name: "type" }, name: { name: "name" },
    unit: { name: "unit" }, location: { name: "location" }, updatedAt: { name: "updated_at" },
  },
}));

vi.mock("drizzle-orm", () => ({
  and: vi.fn((...args) => args),
  asc: vi.fn(value => value),
  desc: vi.fn(value => value),
  eq: vi.fn((left, right) => ({ left, right })),
  inArray: vi.fn((left, values) => ({ left, values })),
  like: vi.fn((left, right) => ({ left, right })),
  sql: Object.assign((strings: TemplateStringsArray, ...values: unknown[]) => ({ strings, values }), { raw: (value: string) => value }),
}));

vi.mock("../lib/auth.js", () => ({
  requireAuth: (req: Request, _res: Response, next: NextFunction) => {
    (req as Request & { userId?: string }).userId = "test-user";
    next();
  },
  requireRole: () => (_req: Request, _res: Response, next: NextFunction) => next(),
}));

vi.mock("../lib/audit.js", () => ({ writeAuditLog: vi.fn().mockResolvedValue(undefined) }));

import productsNowRouter from "../routes/products-now.js";

function createApp() {
  const app = express();
  app.use(express.json());
  app.use("/api/balances/now/products", productsNowRouter);
  return app;
}

describe("Datatex NOW product synchronization API", () => {
  const previousToken = process.env.DATATEX_CONNECTOR_TOKEN;

  beforeEach(() => {
    vi.clearAllMocks();
    process.env.DATATEX_CONNECTOR_TOKEN = "test-only-connector-token";
  });

  afterAll(() => {
    if (previousToken === undefined) delete process.env.DATATEX_CONNECTOR_TOKEN;
    else process.env.DATATEX_CONNECTOR_TOKEN = previousToken;
  });

  it("does not let a product reject endpoint reject a balance preview", async () => {
    const response = await request(createApp())
      .post("/api/balances/now/products/balance-run-1/reject");

    expect(response.status).toBe(404);
    expect(dbMock.update).not.toHaveBeenCalled();
  });

  it("rejects product rows from a warehouse other than the requested warehouse", async () => {
    const response = await request(createApp())
      .post("/api/balances/now/products/product-QA-run-1/preview")
      .set("x-datatex-token", "test-only-connector-token")
      .send({
        extractedAt: "2026-10-27T20:00:00.000Z",
        rows: [{ warehouse: "Q1", type: "Q", code: "0201-0008", name: "Producto", unit: "kg", location: "A-01" }],
      });

    expect(response.status).toBe(400);
    expect(response.body.error).toMatch(/almacenes/i);
    expect(dbMock.update).not.toHaveBeenCalled();
  });

  it("rejects type S rows before creating a preview", async () => {
    const response = await request(createApp())
      .post("/api/balances/now/products/product-QA-run-1/preview")
      .set("x-datatex-token", "test-only-connector-token")
      .send({
        extractedAt: "2026-10-27T20:00:00.000Z",
        rows: [{ warehouse: "QA", type: "S", code: "0201-0008", name: "Producto", unit: "kg", location: "A-01" }],
      });

    expect(response.status).toBe(400);
    expect(dbMock.update).not.toHaveBeenCalled();
  });
});
