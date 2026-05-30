import express, { type Express, type Request, type Response, type NextFunction } from "express";
import compression from "compression";
import cors from "cors";
import helmet from "helmet";
import pinoHttp from "pino-http";
import path from "path";
import router from "./routes";
import { logger } from "./lib/logger";
import { generalApiLimiter } from "./lib/rate-limit.js";

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
      styleSrc: ["'self'", "'unsafe-inline'"],
      imgSrc: ["'self'", "https://res.cloudinary.com", "https://drive.google.com"],
      connectSrc: ["'self'"],
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

// Warn if APP_URL is not configured in production
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
─────────────────────────────────────

router.post(
  "/:id/photos",
  requireAuth,
  requireRole("supervisor", "admin", "operator"),
  upload.array("photos", 5),
  asyncHandler(async (req, res) => {
    const { id } = req.params;
    const files = req.files as Express.Multer.File[] | undefined;
    if (!files || files.length === 0) {
      res.status(400).json({ error: "No se enviaron archivos" }); return;
    }

    const [record] = await db.select().from(immobilizedProductsTable).where(eq(immobilizedProductsTable.id, id as string)).limit(1);
    if (!record) { res.status(404).json({ error: "Registro no encontrado" }); return; }

    const existing = (record.photos as string[] | null) ?? [];
    const slots = 5 - existing.length;
    if (slots <= 0) {
      res.status(400).json({ error: "Ya se alcanzó el límite de 5 fotos" }); return;
    }

    // Get product name for naming
    const [product] = await db.select({ code: productsTable.code, name: productsTable.name })
      .from(productsTable).where(eq(productsTable.id, record.productId)).limit(1);
    const productLabel = product?.code ?? product?.name ?? "inmov";
    const date = record.immobilizedDate ?? new Date().toISOString().slice(0, 10);
    const startIndex = existing.length + 1;

    const toUpload = files.slice(0, slots);
    const uploaded: string[] = [];
    const errors: string[] = [];

    for (let i = 0; i < toUpload.length; i++) {
      const file = toUpload[i]!;
      try {
        const ext = "." + (file.mimetype.split("/")[1] ?? "jpg").replace("jpeg", "jpg");
        const fileName = buildPhotoName(productLabel, date, startIndex + i, ext);
        const { url } = await uploadFileToDrive(file.buffer, fileName, file.mimetype);
        uploaded.push(url);
      } catch (err) {
        errors.push(`Foto ${i + 1}: ${err instanceof Error ? err.message : "Error desconocido"}`);
      }
    }

    if (uploaded.length === 0) {
      res.status(500).json({ error: "No se pudo subir ninguna foto", details: errors }); return;
    }

    const newPhotos = [...existing, ...uploaded];
    const [updated] = await db.update(immobilizedProductsTable)
      .set({ photos: newPhotos, updatedAt: new Date() })
      .where(eq(immobilizedProductsTable.id, id as string)).returning();

    res.status(errors.length > 0 ? 207 : 201).json({
      record: updated,
      uploaded: uploaded.length,
      errors: errors.length > 0 ? errors : undefined,
    });
  })
);

// ── Photo delete (Drive) ───────────────────────────────────────────────────────

router.delete(
  "/:id/photos/:photoIndex",
  requireAuth,
  requireRole("supervisor", "admin"),
  asyncHandler(async (req, res) => {
    const { id, photoIndex } = req.params;
    const idx = parseInt(photoIndex as string, 10);

    const [record] = await db.select().from(immobilizedProductsTable).where(eq(immobilizedProductsTable.id, id as string)).limit(1);
    if (!record) { res.status(404).json({ error: "Registro no encontrado" }); return; }

    const photos = [...((record.photos as string[] | null) ?? [])];
    if (isNaN(idx) || idx < 0 || idx >= photos.length) {
      res.status(400).json({ error: "Índice de foto inválido" }); return;
    }

    const url = photos[idx]!;
    const fileId = extractFileId(url);
    if (fileId) { await deleteFileFromDrive(fileId); }

    photos.splice(idx, 1);
    const [updated] = await db.update(immobilizedProductsTable)
      .set({ photos, updatedAt: new Date() })
      .where(eq(immobilizedProductsTable.id, id as string)).returning();

    const authedReq2 = req as AuthenticatedRequest;
    void writeAuditLog({ userId: authedReq2.userId, action: "delete", resource: "immobilized_photo", resourceId: id, details: { photoIndex: idx }, ipAddress: req.ip });
    res.json(updated);
  })
);

export default router;
