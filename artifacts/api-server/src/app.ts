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
// En Render hay 1 proxy delante (valor por defecto). Si cambias de hosting,
// ajusta TRUST_PROXY en las variables de entorno sin tocar código.
// Esto evita que un atacante falsee su IP con el header X-Forwarded-For.
// ---------------------------------------------------------------------------
const trustProxyRaw = process.env.TRUST_PROXY ?? "1";
const trustProxyValue = /^\d+$/.test(trustProxyRaw) ? Number(trustProxyRaw) : trustProxyRaw;
app.set("trust proxy", trustProxyValue);

// ---------------------------------------------------------------------------
// Helmet con CSP estricta — agrega headers HTTP de seguridad:
//   X-Content-Type-Options, X-Frame-Options, Strict-Transport-Security,
//   Content-Security-Policy, Referrer-Policy, etc.
// Se coloca ANTES de cualquier ruta.
// ---------------------------------------------------------------------------
app.use(
  helmet({
    contentSecurityPolicy: {
      useDefaults: true,
      directives: {
        "default-src": ["'self'"],
        // 'unsafe-inline' en style-src es necesario para React + Tailwind.
        "style-src": ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
        "font-src": ["'self'", "https://fonts.gstatic.com", "data:"],
        "img-src": ["'self'", "data:", "blob:", "https://res.cloudinary.com", "https://drive.google.com", "https://lh3.googleusercontent.com"],
        "script-src": ["'self'"],
        "connect-src": ["'self'", "https://api.cloudinary.com"],
        "frame-ancestors": ["'none'"],
        "object-src": ["'none'"],
        "base-uri": ["'self'"],
        "form-action": ["'self'"],
      },
    },
    crossOriginEmbedderPolicy: false, // Permitir imágenes de Cloudinary
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
    // En producción, rechazar requests sin Origin (excepto healthchecks locales).
    if (!origin) {
      if (process.env.NODE_ENV === "production") {
        return callback(null, false);
      }
      return callback(null, true);
    }
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
// Global error handler — respeta err.status / err.statusCode si existen
// (multer, validate-mime, errores custom). También maneja ZodError con 400.
// ---------------------------------------------------------------------------
interface HttpError extends Error {
  status?: number;
  statusCode?: number;
}

app.use((err: HttpError, _req: Request, res: Response, _next: NextFunction) => {
  // Errores de validación Zod → 400 con detalle útil.
  if (err instanceof ZodError) {
    res.status(400).json({
      error: "Datos inválidos",
      issues: err.issues.map(i => ({ path: i.path.join("."), message: i.message })),
    });
    return;
  }

  const status = err.status ?? err.statusCode;

  // Error con status conocido (4xx) → devolver mensaje original.
  if (typeof status === "number" && status >= 400 && status < 500) {
    res.status(status).json({ error: err.message || "Solicitud inválida" });
    return;
  }

  // Errores de multer (tamaño, tipo, etc.)
  if (err.name === "MulterError") {
    res.status(400).json({ error: err.message });
    return;
  }

  // Error de CORS
  if (err.message === "Not allowed by CORS") {
    res.status(403).json({ error: "Origen no permitido" });
    return;
  }

  // Resto: 500 genérico sin filtrar internals.
  logger.error({ err }, "Unhandled error");
  res.status(500).json({ error: "Error interno del servidor" });
});

export default app;
