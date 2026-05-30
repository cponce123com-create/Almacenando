import type { Request, Response, NextFunction, RequestHandler } from "express";

// ---------------------------------------------------------------------------
// asyncHandler
//
// Envuelve cualquier handler async de Express para capturar errores
// automáticamente y pasarlos al error handler global (app.ts).
//
// Generic R extends Request lets route handlers use typed request objects
// like AuthenticatedRequest without triggering overload mismatches.
//
// Sin esto, si la base de datos lanza un error inesperado en una ruta async,
// Express no lo captura y el servidor puede quedar colgado o responder sin
// el formato de error correcto.
//
// Uso:
//   router.get("/ruta", asyncHandler(async (req, res) => {
//     const data = await db.select()...
//     res.json(data);
//   }));
// ---------------------------------------------------------------------------
export function asyncHandler<R extends Request>(
  fn: (req: R, res: Response, next: NextFunction) => Promise<unknown>,
): RequestHandler {
  return (req, res, next) => {
    Promise.resolve(fn(req as R, res, next)).catch(next);
  };
}
