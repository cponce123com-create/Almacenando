import { fileTypeFromBuffer } from "file-type";

export type AllowedCategory = "image" | "pdf" | "document";

const ALLOWED_MIMES: Record<AllowedCategory, string[]> = {
  image: ["image/jpeg", "image/png", "image/webp", "image/gif"],
  pdf: ["application/pdf"],
  document: [
    "application/pdf",
    "application/msword",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    "application/vnd.ms-excel",
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  ],
};

export async function validateMimeType(
  buffer: Buffer,
  category: AllowedCategory
): Promise<void> {
  const detected = await fileTypeFromBuffer(buffer);
  if (!detected) {
    throw Object.assign(new Error("No se pudo determinar el tipo de archivo"), { status: 400 });
  }
  const allowed = ALLOWED_MIMES[category];
  if (!allowed.includes(detected.mime)) {
    throw Object.assign(
      new Error(`Tipo de archivo no permitido: ${detected.mime}. Se esperaba: ${category}`),
      { status: 400 }
    );
  }
}
