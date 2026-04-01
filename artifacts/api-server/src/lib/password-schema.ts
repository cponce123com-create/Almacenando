import { z } from "zod/v4";

export const passwordSchema = z.string()
  .min(8, "La contraseña debe tener al menos 8 caracteres")
  .regex(/[A-Z]/, "Debe tener al menos una mayúscula")
  .regex(/[0-9]/, "Debe tener al menos un número");
