import { Router, type IRouter } from "express";
import healthRouter from "./health";
import authRouter from "./auth";
import profileRouter from "./profile";
import legacyRouter from "./legacy";
import recipientsRouter from "./recipients";
import trustedContactsRouter from "./trusted-contacts";
import funeralRouter from "./funeral";
import activationRouter from "./activation";
import contactConfirmRouter from "./contact-confirm";
import deathReportsRouter from "./death-reports";
import accessRouter from "./access";
import dashboardRouter from "./dashboard";
import adminRouter from "./admin";
import uploadRouter from "./upload";
import publicRouter from "./public";
import keyConfigRouter from "./key-config";

const router: IRouter = Router();

router.use("/public", publicRouter);
router.use(healthRouter);
router.use("/auth", authRouter);
router.use("/profile", profileRouter);
router.use("/legacy-items", legacyRouter);
router.use("/recipients", recipientsRouter);
router.use("/trusted-contacts", trustedContactsRouter);
router.use("/funeral-preferences", funeralRouter);
router.use("/activation-settings", activationRouter);
router.use("/activation", contactConfirmRouter);
router.use("/death-reports", deathReportsRouter);
router.use("/access", accessRouter);
router.use("/dashboard", dashboardRouter);
router.use("/admin", adminRouter);
router.use("/upload", uploadRouter);
router.use("/key-config", keyConfigRouter);

export default router;
