import { Router } from "express";
import { requireAuth } from "../lib/auth.js";

const router = Router();

// These endpoints are legacy stubs — all death report logic lives in /public/report-death/*.
// They are intentionally disabled to prevent unauthenticated access.
router.post("/", requireAuth, (_req, res) => {
  res.status(410).json({ error: "Deprecated. Use /api/public/report-death/submit instead." });
});

router.post("/:id/confirm", requireAuth, (_req, res) => {
  res.status(410).json({ error: "Deprecated. Use /api/public/report-death/confirm/:reportId instead." });
});

export default router;
