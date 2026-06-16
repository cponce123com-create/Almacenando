import express, { type Express, type Request, type Response, type NextFunction } from "express";
import compression from "compression";
import cors from "cors";
import helmet from "helmet";
import pinoHttp from "pino-http";
import path from "path";
import { randomUUID } from "crypto";
import router from "./routes";
import publicMsdsRouter from "./routes/public-msds.js";
import { logger } from "./lib/logger";
import { generalApiLimiter, aiLimiter } from "./lib/rate-limit.js";

const app: Express = express();

// ---------------------------------------------------------------------------
// Trust proxy — "loopback" solo confía en el proxy local de Render,
// evitando que un atacante falsee su IP con el header X-Forwarded-For.
// ---------------------------------------------------------------------------
app.set("trust proxy", 1);

// ---------------------------------------------------------------------------
// Helmet — agrega headers HTTP de seguridad automáticamente:
//   X-Content-Type-Options, X-Frame-Options, Strict-Transport-Security, etc.
// Se coloca ANTES de cualquier ruta.
// ---------------------------------------------------------------------------
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
      fontSrc: ["'self'", "https://fonts.gstatic.com"],
      imgSrc: ["'self'", "https://res.cloudinary.com", "https://drive.google.com", "data:"],
      connectSrc: [
        "'self'",
        "https://res.cloudinary.com",
        "https://api.cloudinary.com",
        "https://drive.google.com",
        "https://www.googleapis.com",
      ],
    },
  },
}));

// ---------------------------------------------------------------------------
// Static frontend serving (production only)
//
// On Render there is only ONE service, so the Express server must serve both:
//   - /api/*  → API routes (registered below)
//   - /*      → React SPA (legado/dist/public)
//
// We use process.cwd() (the monorepo root) to locate the frontend build.
// This avoids relying on import.meta.url which becomes undefined when esbuild
// compiles ESM → CJS format, causing a TypeError at startup.
// ---------------------------------------------------------------------------
const FRONTEND_DIST = process.env.FRONTEND_DIST_PATH
  ?? path.resolve(process.cwd(), "artifacts/legado/dist/public");

function getAllowedOrigins(): string[] {
  const origins: string[] = [];
  if (process.env.APP_URL) origins.push(process.env.APP_URL.replace(/\/$/, ""));
  if (process.env.NODE_ENV !== "production") {
    origins.push("http://localhost:3000", "http://localhost:5173");
  }
  return origins;
}

// Warn if APP_URL is missing in production — CORS will reject all requests with Origin header
if (process.env.NODE_ENV === "production" && !process.env.APP_URL) {
  logger.warn("APP_URL not configured — CORS will reject all requests with an Origin header. Set APP_URL in your environment.");
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

// ---------------------------------------------------------------------------
// Request ID — asigna un UUID único a cada request para trazabilidad.
// Se usa como correlation ID en logs y se devuelve en el header X-Request-Id.
// ---------------------------------------------------------------------------
app.use((req: Request, res: Response, next: NextFunction) => {
  const requestId = (req.headers["x-request-id"] as string) ?? randomUUID();
  res.setHeader("X-Request-Id", requestId);
  (req as any).requestId = requestId;
  next();
});

// ---------------------------------------------------------------------------
// Cache-Control para endpoints GET de datos semi-estáticos.
// Estos datos cambian con poca frecuencia (productos, ubicaciones, insumos).
// El navegador/cliente puede cachear por 30s sin revalidar (max-age=30)
// y hasta 60s con revalidación condicional (stale-while-revalidate=30).
// ---------------------------------------------------------------------------
const STATIC_CACHE_ROUTES = ["/api/products", "/api/locations", "/api/supplies"];
app.use((req: Request, res: Response, next: NextFunction) => {
  if (req.method === "GET" && STATIC_CACHE_ROUTES.some((r) => req.path?.startsWith(r))) {
    res.setHeader("Cache-Control", "private, max-age=30, stale-while-revalidate=30");
  }
  next();
});
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
app.use(compression());
app.use(express.json({ limit: "2mb" }));
app.use(express.urlencoded({ extended: true, limit: "2mb" }));

// ---------------------------------------------------------------------------
// Public routes — SIN autenticación
// Deben registrarse ANTES del router general para no pasar por requireAuth.
// ---------------------------------------------------------------------------
app.use("/api/public/msds", publicMsdsRouter);

// ---------------------------------------------------------------------------
// Route-level rate limiting
// AI routes get a tighter limit to protect against Gemini cost spikes.
// General API routes use the catch-all limiter.
// ---------------------------------------------------------------------------
app.use("/api/compatibility", aiLimiter);
app.use("/api/ai", aiLimiter);
app.use("/api/msds", aiLimiter);
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
