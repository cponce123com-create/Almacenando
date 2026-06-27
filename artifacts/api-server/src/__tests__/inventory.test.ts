import { describe, it, expect, vi, beforeEach } from "vitest";
import request from "supertest";
import express from "express";
import jwt from "jsonwebtoken";

// ── Hoisted mocks ─────────────────────────────────────────────────────────────
const { dbSelectMock, dbInsertMock, dbUpdateMock, dbDeleteMock, auditLogMock, uploadDriveMock } =
  vi.hoisted(() => ({
    dbSelectMock: vi.fn(),
    dbInsertMock: vi.fn(),
    dbUpdateMock: vi.fn(),
    dbDeleteMock: vi.fn(),
    auditLogMock: vi.fn().mockResolvedValue(undefined),
    uploadDriveMock: vi.fn().mockResolvedValue({
      url: "https://drive.google.com/file/d/abc/view",
      fileId: "abc",
    }),
  }));

vi.mock("@workspace/db", () => ({
  db: {
    select: dbSelectMock,
    insert: dbInsertMock,
    update: dbUpdateMock,
    delete: dbDeleteMock,
    execute: dbSelectMock, // Alias: execute se comporta como select en tests
  },
  inventoryRecordsTable: {
    id: { name: "id" },
    warehouse: { name: "warehouse" },
    productId: { name: "product_id" },
    recordDate: { name: "record_date" },
    previousBalance: { name: "previous_balance" },
    inputs: { name: "inputs" },
    outputs: { name: "outputs" },
    finalBalance: { name: "final_balance" },
    physicalCount: { name: "physical_count" },
    photoUrl: { name: "photo_url" },
    responsible: { name: "responsible" },
    location: { name: "location" },
    missingLabel: { name: "missing_label" },
    notes: { name: "notes" },
    registeredBy: { name: "registered_by" },
    createdAt: { name: "created_at" },
    updatedAt: { name: "updated_at" },
  },
  inventoryBoxesTable: {
    id: { name: "id" },
    inventoryRecordId: { name: "inventory_record_id" },
    boxNumber: { name: "box_number" },
    weight: { name: "weight" },
    tare: { name: "tare" },
    lot: { name: "lot" },
    photoUrl: { name: "photo_url" },
    createdAt: { name: "created_at" },
  },
  productsTable: {
    id: { name: "id" },
    code: { name: "code" },
    name: { name: "name" },
  },
  usersTable: {
    id: { name: "id" },
    email: { name: "email" },
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
    lt: vi.fn(() => ({ _tag: "lt" })),
    and: vi.fn(() => ({ _tag: "and" })),
    or: vi.fn(() => ({ _tag: "or" })),
    desc: vi.fn(() => ({ _tag: "desc" })),
    asc: vi.fn(() => ({ _tag: "asc" })),
    gte: vi.fn(() => ({ _tag: "gte" })),
    lte: vi.fn(() => ({ _tag: "lte" })),
    ilike: vi.fn(() => ({ _tag: "ilike" })),
    inArray: vi.fn(() => ({ _tag: "inArray" })),
    sql: vi.fn(() => ({ _tag: "sql" })),
    count: vi.fn(() => ({ _tag: "count" })),
    max: vi.fn(() => ({ _tag: "max" })),
  };
});

vi.mock("../lib/audit.js", () => ({ writeAuditLog: auditLogMock }));
vi.mock("../lib/google-drive.js", () => ({
  uploadFileToDrive: uploadDriveMock,
  deleteFileFromDrive: vi.fn().mockResolvedValue(undefined),
  isDriveConfigured: vi.fn().mockReturnValue(true),
  extractFileId: vi.fn().mockReturnValue("abc"),
}));

import inventoryRouter from "../routes/inventory.js";

// ── Helpers ───────────────────────────────────────────────────────────────────

/**
 * Creates a fully thenable Drizzle-like select chain.
 * The chain can be awaited at any point and resolves to `rows`.
 * All builder methods (from, where, limit, offset, orderBy, groupBy, …) are
 * mocked to return the same chain, so any call sequence will work.
 */
function makeSelectChain(rows: Record<string, unknown>[]) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const chain: any = {};
  // Make the chain itself thenable — Drizzle query builders are Promises
  chain.then = (
    onfulfilled: (value: typeof rows) => unknown,
    onrejected: ((reason: unknown) => unknown) | undefined
  ) => Promise.resolve(rows).then(onfulfilled, onrejected);
  chain.catch = (onrejected: (reason: unknown) => unknown) =>
    Promise.resolve(rows).catch(onrejected);

  for (const method of [
    "from", "where", "limit", "offset", "orderBy", "groupBy",
    "leftJoin", "innerJoin", "having",
  ]) {
    chain[method] = vi.fn(() => chain);
  }
  return chain;
}

function makeInsertChain(returning: Record<string, unknown>[]) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const chain: any = {};
  chain.values = vi.fn(() => chain);
  chain.onConflictDoNothing = vi.fn(() => chain);
  chain.returning = vi.fn(() => Promise.resolve(returning));
  return chain;
}

function makeDeleteChain(returning: Record<string, unknown>[]) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const chain: any = {};
  chain.where = vi.fn(() => chain);
  chain.returning = vi.fn(() => Promise.resolve(returning));
  return chain;
}

function createApp() {
  const app = express();
  app.use(express.json());
  app.use("/api/inventory", inventoryRouter);
  return app;
}

const TEST_SECRET = process.env.SESSION_SECRET!;

function makeToken(role = "operator", userId = "user-1") {
  return jwt.sign(
    { userId, email: "test@almacen.com", role, jti: `jti-${role}-${Date.now()}` },
    TEST_SECRET,
    { expiresIn: "1h" }
  );
}

/**
 * requireAuth fires two parallel db.select calls:
 *   1st → user status/role check  (must come before blacklist in Promise.all order)
 *   2nd → JTI blacklist check
 */
function mockRequireAuth(role = "operator") {
  dbSelectMock
    .mockReturnValueOnce(makeSelectChain([{ status: "active", role }]))
    .mockReturnValueOnce(makeSelectChain([])); // JTI not revoked
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe("Inventory Routes", () => {
  beforeEach(() => {
    // vi.resetAllMocks clears both call history AND mockReturnValueOnce queues,
    // preventing stale queued values from leaking between tests.
    vi.resetAllMocks();
    auditLogMock.mockResolvedValue(undefined);
    uploadDriveMock.mockResolvedValue({
      url: "https://drive.google.com/file/d/abc/view",
      fileId: "abc",
    });
  });

  // ── GET / ─────────────────────────────────────────────────────────────────

  describe("GET /api/inventory", () => {
    it("returns 401 when no Authorization header is sent", async () => {
      const res = await request(createApp()).get("/api/inventory");
      expect(res.status).toBe(401);
    });

    it("returns 200 with paginated data for an authenticated user", async () => {
      mockRequireAuth("operator");
      // Handler makes 4 sequential db.select calls:
      // 1) count query, 2) records, 3) boxes, 4) lastConsumption
      dbSelectMock
        .mockReturnValueOnce(makeSelectChain([{ total: "3" }]))          // count
        .mockReturnValueOnce(makeSelectChain([{
          id: "rec-1", warehouse: "General", productId: "prod-1",
          recordDate: "2024-06-01", previousBalance: "100", inputs: "50",
          outputs: "20", finalBalance: "130", physicalCount: null,
          photoUrl: null, responsible: "Luis", notes: null,
          registeredBy: "user-1", createdAt: new Date(), updatedAt: new Date(),
        }]))                                                               // records
        .mockReturnValueOnce(makeSelectChain([]))                         // boxes
        .mockReturnValueOnce(makeSelectChain([{
          productId: "prod-1", lastConsumptionDate: "2024-06-01",
        }]));                                                              // lastConsumption

      const res = await request(createApp())
        .get("/api/inventory")
        .set("Authorization", `Bearer ${makeToken("operator")}`);

      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty("data");
      expect(res.body).toHaveProperty("total");
    });
  });

  // ── POST / — role & validation ────────────────────────────────────────────

  describe("POST /api/inventory", () => {
    const validPayload = {
      warehouse: "General",
      productId: "prod-1",
      recordDate: "2024-06-01",
      previousBalance: "100",
      inputs: "50",
      outputs: "20",
      finalBalance: "130",
      responsible: "Luis",
    };

    it("returns 403 when a readonly user tries to create a record", async () => {
      mockRequireAuth("readonly");

      const res = await request(createApp())
        .post("/api/inventory")
        .set("Authorization", `Bearer ${makeToken("readonly")}`)
        .send(validPayload);

      expect(res.status).toBe(403);
    });

    it("returns 400 for a payload with missing required fields", async () => {
      mockRequireAuth("operator");

      const res = await request(createApp())
        .post("/api/inventory")
        .set("Authorization", `Bearer ${makeToken("operator")}`)
        .send({ warehouse: "General" }); // missing productId, recordDate, etc.

      expect(res.status).toBe(400);
    });

    it("creates a record successfully and returns 201", async () => {
      mockRequireAuth("operator");

      const createdRecord = {
        id: "rec-new", ...validPayload,
        physicalCount: null, photoUrl: null, notes: null,
        registeredBy: "user-1", createdAt: new Date(), updatedAt: new Date(),
      };

      // Handler calls: product lookup, then insert record, then select boxes
      dbSelectMock
        .mockReturnValueOnce(makeSelectChain([{ code: "PROD-01", name: "Producto A" }]))  // product
        .mockReturnValueOnce(makeSelectChain([]));                                          // boxes after insert
      dbInsertMock
        .mockReturnValueOnce(makeInsertChain([createdRecord])); // record insert

      const res = await request(createApp())
        .post("/api/inventory")
        .set("Authorization", `Bearer ${makeToken("operator")}`)
        .send(validPayload);

      expect(res.status).toBe(201);
      expect(res.body.id).toBe("rec-new");
      expect(res.body.finalBalance).toBe("130");
    });

    it("derives physicalCount from box weights when boxes are provided", async () => {
      mockRequireAuth("supervisor");

      const boxesData = JSON.stringify([
        { weight: "30.5", lot: "L-001" },
        { weight: "25.0", lot: "L-002" },
      ]);
      const capturedValues: Record<string, unknown>[] = [];

      dbSelectMock
        .mockReturnValueOnce(makeSelectChain([{ code: "PROD-01", name: "Producto A" }]))
        .mockReturnValueOnce(makeSelectChain([])); // boxes list after insert

      dbInsertMock.mockImplementation(() => {
        const chain: Record<string, unknown> = {};
        chain.values = vi.fn((v: unknown) => {
          capturedValues.push(v as Record<string, unknown>);
          return chain;
        });
        chain.returning = vi.fn(() =>
          Promise.resolve([{
            id: "rec-new", ...validPayload,
            physicalCount: "55.5", finalBalance: "55.5",
            photoUrl: null, notes: null,
            registeredBy: "user-1", createdAt: new Date(), updatedAt: new Date(),
          }])
        );
        return chain;
      });

      const res = await request(createApp())
        .post("/api/inventory")
        .set("Authorization", `Bearer ${makeToken("supervisor")}`)
        .send({ ...validPayload, boxesData });

      expect(res.status).toBe(201);
      // physicalCount on the inserted record should be the sum of box weights (30.5 + 25.0 = 55.5)
      const inserted = capturedValues.find(v => (v as Record<string, unknown>).physicalCount);
      expect(inserted?.physicalCount).toBe("55.5");
    });
  });

  // ── DELETE /:id ───────────────────────────────────────────────────────────

  describe("DELETE /api/inventory/:id", () => {
    it("returns 401 when no Authorization header is sent", async () => {
      const res = await request(createApp()).delete("/api/inventory/rec-1");
      expect(res.status).toBe(401);
    });

    it("returns 403 when an operator tries to delete a record", async () => {
      mockRequireAuth("operator");

      const res = await request(createApp())
        .delete("/api/inventory/rec-1")
        .set("Authorization", `Bearer ${makeToken("operator")}`);

      expect(res.status).toBe(403);
    });

    it("deletes the record and returns 200 when called by a supervisor", async () => {
      mockRequireAuth("supervisor");
      // DELETE handler does: db.delete(inventoryRecordsTable).where(...).returning()
      dbDeleteMock.mockReturnValueOnce(makeDeleteChain([{ id: "rec-1" }]));

      const res = await request(createApp())
        .delete("/api/inventory/rec-1")
        .set("Authorization", `Bearer ${makeToken("supervisor")}`);

      expect(res.status).toBe(200);
    });

    it("returns 404 when the record does not exist", async () => {
      mockRequireAuth("supervisor");
      dbDeleteMock.mockReturnValueOnce(makeDeleteChain([])); // no rows deleted

      const res = await request(createApp())
        .delete("/api/inventory/nonexistent")
        .set("Authorization", `Bearer ${makeToken("supervisor")}`);

      expect(res.status).toBe(404);
    });
  });
});
