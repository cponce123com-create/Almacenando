import rateLimit from "express-rate-limit";

/** 5 login attempts per 15 minutes per IP */
export const authLoginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 5,
  standardHeaders: "draft-7",
  legacyHeaders: false,
  message: { error: "Demasiados intentos. Espera 15 minutos antes de intentar de nuevo." },
  skip: () => process.env.NODE_ENV === "test",
});

/** 3 death report submissions per hour per IP */
export const deathReportLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  limit: 3,
  standardHeaders: "draft-7",
  legacyHeaders: false,
  message: { error: "Has enviado demasiados reportes. Espera una hora antes de intentar de nuevo." },
  skip: () => process.env.NODE_ENV === "test",
});

/** 10 lookups per 15 minutes per IP (looser, but prevents enumeration) */
export const lookupLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  standardHeaders: "draft-7",
  legacyHeaders: false,
  message: { error: "Demasiadas consultas. Espera 15 minutos." },
  skip: () => process.env.NODE_ENV === "test",
});

/** 100 requests per 15 minutes per IP — general API catch-all */
export const generalApiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 100,
  standardHeaders: "draft-7",
  legacyHeaders: false,
  message: { error: "Demasiadas solicitudes. Intenta más tarde." },
  skip: () => process.env.NODE_ENV === "test",
});
