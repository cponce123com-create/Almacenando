import { Router } from "express";
import multer from "multer";
import { requireAuth } from "../lib/auth.js";
import { getCloudinaryResourceType, uploadToCloudinary } from "../lib/cloudinary.js";

const router = Router();

const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 200 * 1024 * 1024, // 200 MB
  },
  fileFilter: (_req, file, cb) => {
    const allowed = [
      "image/jpeg", "image/png", "image/gif", "image/webp",
      "video/mp4", "video/mov", "video/avi", "video/quicktime", "video/webm",
      "audio/mpeg", "audio/mp3", "audio/wav", "audio/ogg", "audio/mp4", "audio/m4a",
      "application/pdf",
      "application/msword",
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      "application/vnd.ms-excel",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    ];
    if (allowed.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error(`Tipo de archivo no permitido: ${file.mimetype}`));
    }
  },
});

router.post("/", requireAuth, upload.single("file"), async (req, res) => {
  try {
    if (!req.file) {
      res.status(400).json({ error: "No se recibió ningún archivo" });
      return;
    }

    const resourceType = getCloudinaryResourceType(req.file.mimetype);

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
