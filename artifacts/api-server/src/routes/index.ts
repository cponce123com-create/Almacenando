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

const router: IRouter = Router();

router.use(healthRouter);
router.use("/auth", authRouter);
router.use("/products", productsRouter);
router.use("/inventory", inventoryRouter);
router.use("/balances", balancesRouter);
router.use("/cuadre", cuadreRouter);
router.use("/immobilized", immobilizedRouter);
router.use("/samples", samplesRouter);
router.use("/dye-lots", dyeLotsRouter);
router.use("/disposition", dispositionRouter);
router.use("/documents", documentsRouter);
router.use("/epp", eppRouter);
router.use("/personnel", personnelRouter);
router.use("/reports", reportsRouter);
router.use("/admin/users", adminUsersRouter);
router.use("/lot-evaluations", lotEvaluationsRouter);

export default router;
