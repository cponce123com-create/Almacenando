import { Router } from "express";
import multer from "multer";
import { requireAuth } from "../lib/auth.js";
import { getCloudinaryResourceType, uploadToCloudinary } from "../lib/cloudinary.js";

const router = Router();

const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 200 * 1024 * 1024,
  },
  fileFilter: (_req, _file, cb) => {
    cb(null, true);
  },
});

router.post("/", requireAuth, upload.single("file"), async (req, res) => {
  try {
    if (!req.file) {
      res.status(400).json({ error: "No se recibió ningún archivo" });
      return;
    }

    const originalMimeType = (req.body?.originalMimeType as string) || req.file.mimetype;
    const resourceType = getCloudinaryResourceType(originalMimeType);

    const result = await uploadToCloudinary(req.file.buffer, {
      resource_type: resourceType,
      folder: "legado",
    });

    res.json({
      url: result.secure_url,
      publicId: result.public_id,
      resourceType: result.resource_type,
      format: result.format,
      bytes: result.bytes,
      width: result.width,
      height: result.height,
      duration: result.duration,
    });
  } catch (error: any) {
    console.error("Cloudinary upload error:", error);
    res.status(500).json({ error: error.message || "Error al subir el archivo" });
  }
});

export default router;
