import { describe, it, expect, vi } from "vitest";
import express from "express";
import request from "supertest";

const mocks = vi.hoisted(() => ({ select: vi.fn() }));
vi.mock("@workspace/db", () => ({
  db: { select: mocks.select },
  pickOrdersTable: {}, pickItemsTable: {}, pickItemWeighingsTable: {},
  productsTable: {}, locationsTable: {}, usersTable: {},
}));
vi.mock("../lib/auth.js", () => ({
  requireAuth: (req: any, _res: any, next: any) => { req.userId = "u1"; req.userRole = req.get("x-role"); next(); },
  requireRole: (...roles: string[]) => (req: any, res: any, next: any) =>
    roles.includes(req.userRole) ? next() : res.status(403).json({ error: "Acceso denegado" }),
}));
import router from "../routes/picking.js";
const app = express();
app.use(express.json());
app.use("/picking", router);

describe("Validación de pesajes de preparación", () => {
  it("rechaza un registro sin lote antes de consultar la base", async () => {
    mocks.select.mockClear();
    const res = await request(app).put("/picking/items/i1/scan").set("x-role", "operator")
      .send({ barcode: "123", quantity: 0.5, lot: "  " });
    expect(res.status).toBe(400);
    expect(mocks.select).not.toHaveBeenCalled();
  });
  it("rechaza cantidades con más de tres decimales", async () => {
    const res = await request(app).put("/picking/items/i1/scan").set("x-role", "operator")
      .send({ barcode: "123", quantity: 0.0001, lot: "L1" });
    expect(res.status).toBe(400);
  });
  it("impide que un usuario de consulta registre pesajes", async () => {
    const res = await request(app).put("/picking/items/i1/scan").set("x-role", "viewer")
      .send({ barcode: "123", quantity: 0.5, lot: "L1" });
    expect(res.status).toBe(403);
  });
});
