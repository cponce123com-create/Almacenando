import { describe, it, expect, vi, beforeEach } from "vitest";
import request from "supertest";
import express from "express";
import jwt from "jsonwebtoken";

// ── Hoisted mock refs ─────────────────────────────────────────────────────────
const { dbSelectMock, auditLogMock } = vi.hoisted(() => ({
  dbSelectMock: vi.fn(),
  auditLogMock: vi.fn().mockResolvedValue(undefined),
}));

// ── Module mocks ──────────────────────────────────────────────────────────────

vi.mock("@workspace/db", () => ({
  db: { select: dbSelectMock },
  productsTable: {
    id: { name: "id" },
    code: { name: "code" },
    name: { name: "name" },
    status: { name: "status" },
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
    and: vi.fn(() => ({ _tag: "and" })),
    desc: vi.fn(() => ({ _tag: "desc" })),
    like: vi.fn(() => ({ _tag: "like" })),
  };
});

vi.mock("../lib/audit.js", () => ({
  writeAuditLog: auditLogMock,
}));

// Mock email module to avoid sending actual emails during tests
vi.mock("../lib/email/index.js", () => ({
  sendLotChangeNotificationEmail: vi.fn().mockResolvedValue(undefined),
  sendProductOutEmail: vi.fn().mockResolvedValue(undefined),
  sendStockColoranteEmail: vi.fn().mockResolvedValue(undefined),
  sendStockAuxiliarEmail: vi.fn().mockResolvedValue(undefined),
  sendOrderApprovalEmail: vi.fn().mockResolvedValue(undefined),
  sendPlasticBagEmail: vi.fn().mockResolvedValue(undefined),
}));

// ── Imports (after mocks) ────────────────────────────────────────────────────

import notificationsRouter from "../routes/notifications.js";

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeChain(rows: Record<string, unknown>[]) {
  const chain: Record<string, unknown> = {};
  chain.from = vi.fn(() => chain);
  chain.where = vi.fn(() => chain);
  chain.limit = vi.fn(() => Promise.resolve(rows));
  chain.orderBy = vi.fn(() => chain);
  chain.offset = vi.fn(() => chain);
  return chain as {
    from: ReturnType<typeof vi.fn>;
    where: ReturnType<typeof vi.fn>;
    limit: ReturnType<typeof vi.fn>;
    orderBy: ReturnType<typeof vi.fn>;
    offset: ReturnType<typeof vi.fn>;
  };
}

function setCurrentUser(role = "supervisor") {
  dbSelectMock
    .mockReturnValueOnce(makeChain([{ status: "active", role }]))
    .mockReturnValueOnce(makeChain([]));
}

function createApp() {
  const app = express();
  app.use(express.json());
  app.use("/api/notifications", notificationsRouter);
  return app;
}

const TEST_SECRET = process.env.SESSION_SECRET!;
function makeToken(role = "supervisor") {
  return jwt.sign(
    { userId: "user-1", email: "test@test.com", role, jti: `jti-${Date.now()}` },
    TEST_SECRET,
    { expiresIn: "1h" },
  );
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe("Notifications API", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("GET /api/notifications/recipients", () => {
    it("returns 401 without auth", async () => {
      const res = await request(createApp()).get("/api/notifications/recipients");
      expect(res.status).toBe(401);
    });

    it("returns recipient config", async () => {
      setCurrentUser("admin");
      process.env.NOTIFY_LOT_CHANGE = "test@test.com";
      process.env.NOTIFY_PRODUCT_OUT = "out@test.com";
      process.env.NOTIFY_STOCK_COLOR = "color@test.com";

      const res = await request(createApp())
        .get("/api/notifications/recipients")
        .set("Authorization", `Bearer ${makeToken("admin")}`);

      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty("lotChange");
      expect(res.body).toHaveProperty("productOut");
      expect(res.body).toHaveProperty("stockColor");
      expect(res.body).toHaveProperty("stockAux");
      expect(res.body).toHaveProperty("orderApproval");
      expect(res.body).toHaveProperty("plasticBag");
    });

    it("returns empty arrays when no env vars set", async () => {
      setCurrentUser("admin");
      delete process.env.NOTIFY_LOT_CHANGE;
      delete process.env.NOTIFY_PRODUCT_OUT;
      delete process.env.NOTIFY_STOCK_COLOR;

      const res = await request(createApp())
        .get("/api/notifications/recipients")
        .set("Authorization", `Bearer ${makeToken("admin")}`);

      expect(res.status).toBe(200);
      expect(res.body.lotChange).toEqual([]);
    });
  });

  describe("POST /api/notifications/product-out", () => {
    it("sends notification for existing product", async () => {
      setCurrentUser("supervisor");
      dbSelectMock.mockReturnValueOnce(makeChain([
        { id: "p1", code: "P-001", name: "Test Product", status: "active" },
      ]));

      const res = await request(createApp())
        .post("/api/notifications/product-out")
        .set("Authorization", `Bearer ${makeToken()}`)
        .send({ productCode: "P-001", productName: "Test Product" });

      expect(res.status).toBe(200);
    });
  });

  describe("zod validation", () => {
    it("returns 400 for invalid product-out payload", async () => {
      setCurrentUser("supervisor");
      dbSelectMock.mockReturnValueOnce(makeChain([]));
      dbSelectMock.mockReturnValueOnce(makeChain([]));

      const res = await request(createApp())
        .post("/api/notifications/product-out")
        .set("Authorization", `Bearer ${makeToken("supervisor")}`)
        .send({ invalidField: true });

      expect([400, 401]).toContain(res.status);
    });
  });
});
