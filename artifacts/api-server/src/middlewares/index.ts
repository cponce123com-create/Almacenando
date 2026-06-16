/**
 * Middlewares — Almacenando API Server
 *
 * Punto de entrada centralizado para middlewares.
 * Los middlewares activos están implementados en src/lib/ por compatibilidad.
 * Este índice permite importarlos de forma consistente:
 *
 *   import { requireAuth, requireRole } from "../middlewares";
 *   import { authLoginLimiter, generalApiLimiter } from "../middlewares";
 *
 * Los middlewares inline (request-id, cache-control) están definidos
 * directamente en app.ts ya que son específicos de esa capa.
 */
export {
  requireAuth,
  requireRole,
  type AuthenticatedRequest,
} from "../lib/auth.js";

export {
  authLoginLimiter,
  deathReportLimiter,
  lookupLimiter,
  destructiveActionLimiter,
  passwordResetLimiter,
  aiLimiter,
  generalApiLimiter,
} from "../lib/rate-limit.js";

export { asyncHandler } from "../lib/async-handler.js";
