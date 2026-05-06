import { Router, type IRouter } from "express";
import { HealthCheckResponse } from "@workspace/api-zod";

const router: IRouter = Router();

router.get("/healthz", (_req, res) => {
  const parsed = HealthCheckResponse.safeParse({ status: "ok" });
  res.json(parsed.success ? parsed.data : { status: "ok" });
});

export default router;
