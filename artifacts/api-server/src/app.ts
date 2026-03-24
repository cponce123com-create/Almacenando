import express, { type Express, type Request, type Response, type NextFunction } from "express";
import cors from "cors";
import pinoHttp from "pino-http";
import path from "path";
import router from "./routes";
import { logger } from "./lib/logger";
import { generalApiLimiter } from "./lib/rate-limit.js";

const app: Express = express();
app.set("trust proxy", 1);

// ---------------------------------------------------------------------------
// Static frontend serving (production only)
//
// In Replit, the frontend (legado) is served separately as a static artifact
// on "/" and the API runs on "/api". On Render there is only ONE service, so
// the Express server must serve both:
//   - /api/*  → API routes (registered below)
//   - /*      → React SPA (legado/dist/public)
//
// __dirname in the compiled CJS bundle equals the directory of index.cjs,
// i.e. <repo-root>/artifacts/api-server/dist/
// So the frontend build is two levels up + legado/dist/public.
// ---------------------------------------------------------------------------
const FRONTEND_DIST = path.join(__dirname, "../../legado/dist/public");

function getAllowedOrigins(): string[] {
  const origins: string[] = [];
  if (process.env.APP_URL) origins.push(process.env.APP_URL.replace(/\/$/, ""));
  if (process.env.REPLIT_DOMAINS) {
    for (const d of process.env.REPLIT_DOMAINS.split(",")) {
      origins.push(`https://${d.trim()}`);
    }
  }
  if (process.env.REPLIT_DEV_DOMAIN) {
    origins.push(`https://${process.env.REPLIT_DEV_DOMAIN}`);
  }
  if (process.env.NODE_ENV !== "production") {
    origins.push("http://localhost:3000", "http://localhost:5173", "http://localhost:19854");
  }
  return origins;
}

app.use(
  pinoHttp({
    logger,
    serializers: {
      req(req) {
        return {
          id: req.id,
          method: req.method,
          url: req.url?.split("?")[0],
        };
      },
      res(res) {
        return {
          statusCode: res.statusCode,
        };
      },
    },
  }),
);
app.use(cors({
  origin: (origin, callback) => {
    if (!origin) return callback(null, true);
    const allowed = getAllowedOrigins();
    if (allowed.includes(origin)) return callback(null, true);
    logger.warn({ origin }, "CORS blocked request from unauthorized origin");
    callback(new Error("Not allowed by CORS"));
  },
  credentials: true,
}));
app.use(express.json({ limit: "2mb" }));
app.use(express.urlencoded({ extended: true, limit: "2mb" }));

app.use("/api", generalApiLimiter, router);

// ---------------------------------------------------------------------------
// Serve the React SPA in production.
// Static assets (JS, CSS, images) are served from FRONTEND_DIST.
// Any non-/api route that doesn't match a static file falls back to
// index.html so that client-side routing (wouter) works correctly.
// ---------------------------------------------------------------------------
if (process.env.NODE_ENV === "production") {
  // Serve static files (assets/, favicon.svg, etc.)
  app.use(express.static(FRONTEND_DIST));

  // SPA fallback: every non-API GET that doesn't match a file → index.html
  app.get(/^\/(?!api).*$/, (_req: Request, res: Response) => {
    res.sendFile(path.join(FRONTEND_DIST, "index.html"));
  });

  logger.info({ frontendDist: FRONTEND_DIST }, "Serving frontend static files");
}

// Global error handler — catches any unhandled errors thrown in route handlers.
// Logs the full error internally and returns a generic 500 to avoid leaking internals.
app.use((err: Error, _req: Request, res: Response, _next: NextFunction) => {
  logger.error({ err }, "Unhandled error");
  res.status(500).json({ error: "Error interno del servidor" });
});

export default app;
