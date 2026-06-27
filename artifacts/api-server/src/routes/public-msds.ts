import { Router } from "express";
import { db, productsTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { downloadDriveFileAsBuffer } from "../lib/google-drive.js";
import { logger } from "../lib/logger.js";
import { lookupLimiter } from "../lib/rate-limit.js";

const router = Router();

/**
 * GET /api/public/msds/:productId
 *
 * Public endpoint — NO requiere autenticación.
 * Sirve el archivo MSDS (PDF) de un producto descargándolo desde Google Drive
 * usando la cuenta de servicio. Cualquier persona con el enlace puede verlo.
 *
 * Pensado para los QR impresos en el álbum MSDS: al escanear el código QR,
 * el usuario llega aquí y obtiene el PDF directamente, sin pasar por la
 * pantalla de autorización de Google Drive.
 */
router.get("/:productId", lookupLimiter, async (req, res) => {
  try {
    const { productId } = req.params;

    const [product] = await db
      .select({
        id: productsTable.id,
        code: productsTable.code,
        name: productsTable.name,
        msdsUrl: productsTable.msdsUrl,
        msdsFileId: productsTable.msdsFileId,
        msdsFileName: productsTable.msdsFileName,
      })
      .from(productsTable)
      .where(eq(productsTable.id, productId))
      .limit(1);

    if (!product || !product.msdsUrl) {
      res.status(404).json({ error: "Producto no encontrado o sin MSDS vinculada" });
      return;
    }

    // Extract fileId: prefer msdsFileId from DB, fall back to extracting from URL
    let fileId = product.msdsFileId;

    if (!fileId) {
      // Try to extract from Google Drive URL pattern: /d/{fileId}/
      const match = product.msdsUrl.match(/\/d\/([a-zA-Z0-9_-]+)/);
      if (match) {
        fileId = match[1]!;
      } else {
        // Try to extract from docs.google.com/file/d/{fileId} or similar
        const altMatch = product.msdsUrl.match(/file\/d\/([a-zA-Z0-9_-]+)/);
        if (altMatch) {
          fileId = altMatch[1]!;
        }
      }
    }

    if (!fileId) {
      logger.warn({ productId, msdsUrl: product.msdsUrl }, "No se pudo extraer fileId de la URL de MSDS");
      res.status(400).json({ error: "No se pudo determinar el ID del archivo en Google Drive" });
      return;
    }

    logger.info({ productId, productCode: product.code, fileId }, "Sirviendo MSDS público");

    // Download the file using the service account
    const { buffer, mimeType } = await downloadDriveFileAsBuffer(fileId);

    // Determine filename for Content-Disposition
    const fileName = product.msdsFileName
      ? product.msdsFileName
      : `MSDS_${product.code?.replace(/[^a-zA-Z0-9_-]/g, "_") || productId}.pdf`;

    res.setHeader("Content-Type", mimeType || "application/pdf");
    res.setHeader("Content-Disposition", `inline; filename="${fileName}"`);
    res.setHeader("Content-Length", buffer.length.toString());
    res.setHeader("Cache-Control", "public, max-age=3600"); // cache 1 hour

    res.end(buffer);
  } catch (err) {
    logger.error({ err, productId: req.params["productId"] }, "Error al servir MSDS público");
    res.status(500).json({ error: "Error al obtener el archivo MSDS" });
  }
});

export default router;
