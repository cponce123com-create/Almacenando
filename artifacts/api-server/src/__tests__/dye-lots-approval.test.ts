import { beforeEach, describe, expect, it, vi } from "vitest";
import express from "express";
import request from "supertest";

const mocks = vi.hoisted(() => ({ values: vi.fn(), returning: vi.fn() }));

vi.mock("@workspace/db", () => ({
  db: {
    insert: () => ({ values: mocks.values }),
    select: () => ({ from: async () => [] }),
  },
  dyeLotsTable: {},
  usersTable: {},
  productsTable: {},
}));
vi.mock("../lib/auth.js", () => ({
  requireAuth: (req: any, _res: any, next: any) => {
    req.userId = "user-1";
    req.userRole = req.get("x-test-role");
    next();
  },
  requireRole: (...roles: string[]) => (req: any, res: any, next: any) =>
    roles.includes(req.userRole) ? next() : res.status(403).json({ error: "Acceso denegado" }),
}));
vi.mock("../lib/email/index.js", () => ({ sendDyeLotNotificationEmail: vi.fn() }));

import router from "../routes/dye-lots.js";

const app = express();
app.use(express.json());
app.use("/dye-lots", router);

const lot = { productId: "p1", lotNumber: "L1", quantity: 1, receiptDate: "2026-11-01" };

describe("Aprobación de lotes", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.returning.mockResolvedValue([{ id: "lot-1" }]);
    mocks.values.mockReturnValue({ returning: mocks.returning });
  });

  it("impide que un operador registre un lote aprobado", async () => {
    const res = await request(app).post("/dye-lots").set("x-test-role", "operator")
      .send({ ...lot, qualityStatus: "approved" });
    expect(res.status).toBe(403);
    expect(mocks.values).not.toHaveBeenCalled();
  });

  it("registra el responsable y fecha cuando calidad crea un lote aprobado", async () => {
    const res = await request(app).post("/dye-lots").set("x-test-role", "quality")
      .send({ ...lot, qualityStatus: "approved" });
    expect(res.status).toBe(201);
    expect(mocks.values).toHaveBeenCalledWith(expect.objectContaining({
      qualityStatus: "approved", approvedBy: "user-1", approvedAt: expect.any(Date),
    }));
  });
});
