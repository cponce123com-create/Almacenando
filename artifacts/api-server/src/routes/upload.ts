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

    // Always upload as "raw" — files are AES-256 encrypted and Cloudinary
    // cannot parse them as images/video. The original mime type is stored
    // in the legacy item record so the client knows what it is.
    const result = await uploadToCloudinary(req.file.buffer, {
      resource_type: "raw",
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
