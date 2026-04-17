import express, { type Express, type Request, type Response, type NextFunction } from "express";
import cors from "cors";
import helmet from "helmet";
import cookieParser from "cookie-parser";
import pinoHttp from "pino-http";
import path from "path";
import { ZodError } from "zod/v4";
import router from "./routes";
import { logger } from "./lib/logger";
import { generalApiLimiter } from "./lib/rate-limit.js";

const app: Express = express();

// ---------------------------------------------------------------------------
// Trust proxy — configurable por variable de entorno.
// En Render hay 1 proxy delante (valor por defecto).
// ---------------------------------------------------------------------------
const trustProxyRaw = process.env.TRUST_PROXY ?? "1";
const trustProxyValue = /^\d+$/.test(trustProxyRaw) ? Number(trustProxyRaw) : trustProxyRaw;
app.set("trust proxy", trustProxyValue);

// ---------------------------------------------------------------------------
// Helmet con CSP en modo "report-friendly" — agrega headers de seguridad
// pero permite los recursos externos que tu app necesita:
//   - Cloudinary, Google Drive (imágenes)
//   - Google Fonts
//   - Scripts inline de Vite en desarrollo
//
// Si quieres endurecer la CSP más adelante, revisa la consola del navegador
// en "Network" → busca warnings de "Refused to load" y agrega el dominio.
// ---------------------------------------------------------------------------
const isProduction = process.env.NODE_ENV === "production";

app.use(
  helmet({
    contentSecurityPolicy: {
      useDefaults: true,
      directives: {
        "default-src": ["'self'"],
        // 'unsafe-inline' necesario para React + Tailwind.
        "style-src": ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
        "font-src": ["'self'", "https://fonts.gstatic.com", "data:"],
        // Permitir imágenes de los servicios que usa la app.
        "img-src": [
          "'self'",
          "data:",
          "blob:",
          "https://res.cloudinary.com",
          "https://drive.google.com",
          "https://lh3.googleusercontent.com",
          "https://*.googleusercontent.com",
        ],
        // Permitir scripts del propio dominio. En dev también 'unsafe-eval' para Vite HMR.
        "script-src": isProduction
          ? ["'self'"]
          : ["'self'", "'unsafe-inline'", "'unsafe-eval'"],
        // Permitir conexiones (fetch, websockets) a servicios externos.
        "connect-src": [
          "'self'",
          "https://api.cloudinary.com",
          "https://www.googleapis.com",
          "https://drive.google.com",
          ...(isProduction ? [] : ["ws://localhost:*", "http://localhost:*"]),
        ],
        "frame-src": ["'self'", "https://drive.google.com"],
        "object-src": ["'none'"],
        "base-uri": ["'self'"],
      },
    },
    // Necesario para que las imágenes de Cloudinary/Drive se muestren sin errores CORP.
    crossOriginEmbedderPolicy: false,
    crossOriginResourcePolicy: { policy: "cross-origin" },
    referrerPolicy: { policy: "strict-origin-when-cross-origin" },
  }),
);

// ---------------------------------------------------------------------------
// Static frontend serving (production only)
// ---------------------------------------------------------------------------
const FRONTEND_DIST = process.env.FRONTEND_DIST_PATH
  ?? path.resolve(process.cwd(), "artifacts/legado/dist/public");

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
        return { id: req.id, method: req.method, url: req.url?.split("?")[0] };
      },
      res(res) {
        return { statusCode: res.statusCode };
      },
    },
  }),
);

app.use(cors({
  origin: (origin, callback) => {
    // Permitir requests sin Origin (healthchecks, same-origin).
    if (!origin) return callback(null, true);
    const allowed = getAllowedOrigins();
    if (allowed.includes(origin)) return callback(null, true);
    logger.warn({ origin }, "CORS blocked request from unauthorized origin");
    callback(new Error("Not allowed by CORS"));
  },
  credentials: true,
}));

app.use(cookieParser());
app.use(express.json({ limit: "5mb" }));
app.use(express.urlencoded({ extended: true, limit: "5mb" }));

app.use("/api", generalApiLimiter, router);

// ---------------------------------------------------------------------------
// Serve the React SPA in production.
// ---------------------------------------------------------------------------
if (process.env.NODE_ENV === "production") {
  app.use(express.static(FRONTEND_DIST));
  app.get(/^\/(?!api).*$/, (_req: Request, res: Response) => {
    res.sendFile(path.join(FRONTEND_DIST, "index.html"));
  });
  logger.info({ frontendDist: FRONTEND_DIST }, "Serving frontend static files");
}

// ---------------------------------------------------------------------------
// Global error handler
// ---------------------------------------------------------------------------
interface HttpError extends Error {
  status?: number;
  statusCode?: number;
}

app.use((err: HttpError, _req: Request, res: Response, _next: NextFunction) => {
  if (err instanceof ZodError) {
    res.status(400).json({
      error: "Datos inválidos",
      issues: err.issues.map(i => ({ path: i.path.join("."), message: i.message })),
    });
    return;
  }

  const status = err.status ?? err.statusCode;
  if (typeof status === "number" && status >= 400 && status < 500) {
    res.status(status).json({ error: err.message || "Solicitud inválida" });
    return;
  }

  if (err.name === "MulterError") {
    res.status(400).json({ error: err.message });
    return;
  }

  if (err.message === "Not allowed by CORS") {
    res.status(403).json({ error: "Origen no permitido" });
    return;
  }

  logger.error({ err }, "Unhandled error");
  res.status(500).json({ error: "Error interno del servidor" });
});

export default app;
