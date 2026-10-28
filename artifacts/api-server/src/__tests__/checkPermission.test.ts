import { beforeEach, describe, expect, it, vi } from "vitest";
import express from "express";
import request from "supertest";

const { dbSelectMock, requireAuthMock } = vi.hoisted(() => ({
  dbSelectMock: vi.fn(),
  requireAuthMock: vi.fn(),
}));

vi.mock("@workspace/db", () => ({
  db: { select: dbSelectMock },
  userPermissionsTable: { role: "role", pageId: "page_id" },
}));
vi.mock("../lib/auth.js", () => ({
  requireAuth: requireAuthMock,
}));
vi.mock("drizzle-orm", () => ({
  and: (...conditions: unknown[]) => conditions,
  eq: (column: unknown, value: unknown) => ({ column, value }),
}));

import { checkModulePermission } from "../lib/checkPermission.js";

function permissionRow(overrides: Record<string, unknown> = {}) {
  return {
    canView: true, canImport: false, canExport: false, canEdit: false, canDelete: false,
    ...overrides,
  };
}

function appWithPermissionGuard() {
  const app = express();
  app.use(checkModulePermission);
  app.get("/products", (_req, res) => res.json({ ok: true }));
  app.post("/products", (_req, res) => res.json({ ok: true }));
  app.get("/balances/now/connector/next", (_req, res) => res.json({ ok: true }));
  return app;
}

describe("module permission guard", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    requireAuthMock.mockImplementation((req: express.Request, _res: express.Response, next: express.NextFunction) => {
      Object.assign(req, { userId: "user-1", userRole: "operator", userEmail: "operator@example.com", jti: "j1", tokenExp: 1 });
      next();
    });
  });

  it("allows a role that has view permission on the module", async () => {
    dbSelectMock.mockReturnValue({ from: () => ({ where: () => ({ limit: async () => [permissionRow()] }) }) });
    const response = await request(appWithPermissionGuard()).get("/products");
    expect(response.status).toBe(200);
  });

  it("rejects write actions when the role only has view permission", async () => {
    dbSelectMock.mockReturnValue({ from: () => ({ where: () => ({ limit: async () => [permissionRow()] }) }) });
    const response = await request(appWithPermissionGuard()).post("/products");
    expect(response.status).toBe(403);
    expect(response.body.action).toBe("canEdit");
  });

  it("lets the dedicated NOW connector authentication handle connector calls", async () => {
    const response = await request(appWithPermissionGuard())
      .get("/balances/now/connector/next")
      .set("x-datatex-token", "connector-token");
    expect(response.status).toBe(200);
    expect(dbSelectMock).not.toHaveBeenCalled();
  });
});
