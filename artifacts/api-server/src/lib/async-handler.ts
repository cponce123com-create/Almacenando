import type { Request, Response, NextFunction, RequestHandler } from "express";

// ---------------------------------------------------------------------------
// asyncHandler
//
// Envuelve cualquier handler async de Express para capturar errores
// automáticamente y pasarlos al error handler global (app.ts).
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
export function asyncHandler(
  fn: (req: Request, res: Response, next: NextFunction) => Promise<unknown>,
): RequestHandler {
  return (req, res, next) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
}
