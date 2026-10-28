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
  balanceConnectorStateTable: { id: { name: "id" }, lastSeenAt: { name: "last_seen_at" }, lastError: { name: "last_error" }, updatedAt: { name: "updated_at" } },
  balanceRecordsTable: { id: { name: "id" }, warehouse: { name: "warehouse" }, source: { name: "source" } },
  balanceSyncRunsTable: {
    id: { name: "id" }, status: { name: "status" }, requestedAt: { name: "requested_at" },
    claimedAt: { name: "claimed_at" }, requestedBy: { name: "requested_by" }, extractedAt: { name: "extracted_at" },
    completedAt: { name: "completed_at" }, recordCount: { name: "record_count" }, errorMessage: { name: "error_message" },
    payload: { name: "payload" }, summary: { name: "summary" },
  },
}));

vi.mock("drizzle-orm", () => ({
  and: vi.fn((...args) => args),
  asc: vi.fn((value) => value),
  desc: vi.fn((value) => value),
  eq: vi.fn((left, right) => ({ left, right })),
  inArray: vi.fn((left, values) => ({ left, values })),
  lte: vi.fn((left, right) => ({ left, right })),
}));

vi.mock("../lib/auth.js", () => ({
  requireAuth: (req: Request, _res: Response, next: NextFunction) => {
    (req as Request & { userId?: string }).userId = "test-user";
    next();
  },
  requireRole: () => (_req: Request, _res: Response, next: NextFunction) => next(),
}));

vi.mock("../lib/audit.js", () => ({ writeAuditLog: vi.fn().mockResolvedValue(undefined) }));

import balanceNowRouter from "../routes/balances-now.js";

function createApp() {
  const app = express();
  app.use(express.json());
  app.use("/api/balances/now", balanceNowRouter);
  return app;
}

function validRow(overrides: Record<string, unknown> = {}) {
  return {
    warehouse: "QA",
    type: "Q",
    code: "0201-0008",
    productDescription: "PRODUCTO DE PRUEBA",
    shortDescription: "",
    unit: "kg",
    quantity: "12.50",
    locationSummary: "A-01",
    zoneSummary: "Z1",
    ...overrides,
  };
}

function validPayload(rows: unknown[]) {
  return {
    extractedAt: "2026-10-27T20:00:00.000Z",
    balanceDate: "2026-10-27",
    rows,
  };
}

describe("Datatex NOW balance connector API", () => {
  const oldToken = process.env.DATATEX_CONNECTOR_TOKEN;

  beforeEach(() => {
    vi.clearAllMocks();
    process.env.DATATEX_CONNECTOR_TOKEN = "test-only-connector-token";
    dbMock.insert.mockReturnValue({
      values: () => ({
        onConflictDoUpdate: vi.fn().mockResolvedValue(undefined),
      }),
    });
    dbMock.update.mockReturnValue({
      set: () => ({
        where: () => ({
          returning: vi.fn().mockResolvedValue([{ id: "run-1" }]),
        }),
      }),
    });
  });

  afterAll(() => {
    if (oldToken === undefined) delete process.env.DATATEX_CONNECTOR_TOKEN;
    else process.env.DATATEX_CONNECTOR_TOKEN = oldToken;
  });

  it("rejects a connector token that is invalid", async () => {
    const response = await request(createApp())
      .get("/api/balances/now/connector/next")
      .set("x-datatex-token", "wrong-token");

    expect(response.status).toBe(401);
    expect(dbMock.insert).not.toHaveBeenCalled();
  });

  it("rejects empty extractions instead of treating them as zero balances", async () => {
    const response = await request(createApp())
      .post("/api/balances/now/connector/run-1/preview")
      .set("x-datatex-token", "test-only-connector-token")
      .send(validPayload([]));

    expect(response.status).toBe(400);
    expect(response.body.error).toBe("Extracción inválida.");
    expect(dbMock.update).not.toHaveBeenCalled();
  });

  it("rejects duplicate warehouse, code, and unit keys before storing a preview", async () => {
    const row = validRow();
    const response = await request(createApp())
      .post("/api/balances/now/connector/run-1/preview")
      .set("x-datatex-token", "test-only-connector-token")
      .send(validPayload([row, { ...row }]));

    expect(response.status).toBe(400);
    expect(response.body.error).toMatch(/duplicad/i);
    expect(dbMock.update).not.toHaveBeenCalled();
  });

  it("accepts a valid QA/Q1 preview and stores it for confirmation", async () => {
    const response = await request(createApp())
      .post("/api/balances/now/connector/run-1/preview")
      .set("x-datatex-token", "test-only-connector-token")
      .send(validPayload([validRow(), validRow({ warehouse: "Q1", code: "0201-0010" })]));

    expect(response.status).toBe(200);
    expect(response.body.status).toBe("preview");
    expect(response.body.summary).toMatchObject({ total: 2, QA: 1, Q1: 1 });
    expect(dbMock.update).toHaveBeenCalledTimes(1);
  });

  it("keeps the same chemical as separate rows when its locations differ", async () => {
    const response = await request(createApp())
      .post("/api/balances/now/connector/run-1/preview")
      .set("x-datatex-token", "test-only-connector-token")
      .send(validPayload([
        validRow({ locationSummary: "Q04A001", zoneSummary: "ESQ", quantity: "3.25" }),
        validRow({ locationSummary: "Q04A002", zoneSummary: "ESQ", quantity: "7.75" }),
      ]));

    expect(response.status).toBe(200);
    expect(response.body.summary.total).toBe(2);
    expect(dbMock.update).toHaveBeenCalledTimes(1);
  });

  it("rejects one warehouse/code reported in incompatible units", async () => {
    const response = await request(createApp())
      .post("/api/balances/now/connector/run-1/preview")
      .set("x-datatex-token", "test-only-connector-token")
      .send(validPayload([
        validRow({ unit: "kg", locationSummary: "A-01" }),
        validRow({ unit: "L", locationSummary: "A-02" }),
      ]));

    expect(response.status).toBe(400);
    expect(response.body.error).toMatch(/unidades incompatibles|más de una unidad/i);
    expect(dbMock.update).not.toHaveBeenCalled();
  });

  it("rejects non-decimal quantities instead of coercing them to zero", async () => {
    const response = await request(createApp())
      .post("/api/balances/now/connector/run-1/preview")
      .set("x-datatex-token", "test-only-connector-token")
      .send(validPayload([validRow({ quantity: "not-a-number" })]));

    expect(response.status).toBe(400);
    expect(dbMock.update).not.toHaveBeenCalled();
  });
});
