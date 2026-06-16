import { Router, type IRouter } from "express";
import healthRouter from "./health";
import authRouter from "./auth";
import productsRouter from "./products";
import inventoryRouter from "./inventory";
import balancesRouter from "./balances";
import cuadreRouter from "./cuadre";
import immobilizedRouter from "./immobilized";
import samplesRouter from "./samples";
import dyeLotsRouter from "./dye-lots";
import dispositionRouter from "./disposition";
import documentsRouter from "./documents";
import eppRouter from "./epp";
import personnelRouter from "./personnel";
import reportsRouter from "./reports";
import adminUsersRouter from "./admin-users";
import lotEvaluationsRouter from "./lot-evaluations";
import notificationsRouter from "./notifications";
import suppliesRouter from "./supplies";
import surplusRouter from "./surplus";
import permissionsRouter from "./permissions";
import msdsRouter from "./msds";
import compatibilityRouter from "./compatibility";
import locationsRouter from "./locations.js";
import barcodeRouter from "./barcode.js";
import pickingRouter from "./picking.js";
import reorganizationRouter from "./reorganization.js";
import searchRouter from "./search.js";
import analyticsRouter from "./analytics.js";

// ---------------------------------------------------------------------------
// v1 API — versión actual del API.
//   - Se monta en /api/v1 (versión explícita)
//   - También se monta en /api (legacy, para compatibilidad)
//   - Cuando se introduzca v2, se crea un nuevo router v2 con las rutas
//     actualizadas y la app monta ambos.
// ---------------------------------------------------------------------------
const v1Router: IRouter = Router();

v1Router.use(healthRouter);
v1Router.use("/auth", authRouter);
v1Router.use("/products", productsRouter);
v1Router.use("/inventory", inventoryRouter);
v1Router.use("/balances", balancesRouter);
v1Router.use("/cuadre", cuadreRouter);
v1Router.use("/immobilized", immobilizedRouter);
v1Router.use("/samples", samplesRouter);
v1Router.use("/dye-lots", dyeLotsRouter);
v1Router.use("/disposition", dispositionRouter);
v1Router.use("/documents", documentsRouter);
v1Router.use("/epp", eppRouter);
v1Router.use("/personnel", personnelRouter);
v1Router.use("/reports", reportsRouter);
v1Router.use("/admin/users", adminUsersRouter);
v1Router.use("/lot-evaluations", lotEvaluationsRouter);
v1Router.use("/notifications", notificationsRouter);
v1Router.use("/supplies", suppliesRouter);
v1Router.use("/surplus", surplusRouter);
v1Router.use("/admin/permissions", permissionsRouter);
v1Router.use("/msds", msdsRouter);
v1Router.use("/compatibility", compatibilityRouter);
v1Router.use("/locations", locationsRouter);
v1Router.use("/barcode", barcodeRouter);
v1Router.use("/picking", pickingRouter);
v1Router.use("/reorganization", reorganizationRouter);
v1Router.use("/search", searchRouter);
v1Router.use("/analytics", analyticsRouter);

// Legacy alias — mismo router para compatibilidad hacia atrás
const router: IRouter = v1Router;

export default router;
export { v1Router };
