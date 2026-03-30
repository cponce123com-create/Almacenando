import { google } from "googleapis";
import { Readable } from "stream";
import type { drive_v3 } from "googleapis";

// ── Singleton state ───────────────────────────────────────────────────────────
// Parsed once on first use; never re-created per-request.

let _driveClient: drive_v3.Drive | null = null;
let _folderId: string | null = null;

function parseServiceAccountJson() {
  let raw = process.env.GOOGLE_SERVICE_ACCOUNT_JSON;
  if (!raw) throw new Error("GOOGLE_SERVICE_ACCOUNT_JSON no está configurado");
  raw = raw.trim();
  if (!raw.startsWith("{")) raw = "{" + raw + "}";
  try {
    return JSON.parse(raw);
  } catch {
    throw new Error("GOOGLE_SERVICE_ACCOUNT_JSON tiene formato JSON inválido");
  }
}

function resolveFolderId() {
  const raw = process.env.GOOGLE_DRIVE_FOLDER_ID;
  if (!raw) throw new Error("GOOGLE_DRIVE_FOLDER_ID no está configurado");
  const trimmed = raw.trim();
  const match = trimmed.match(/folders\/([a-zA-Z0-9_-]+)/);
  return match ? match[1]! : trimmed;
}

function getDriveClient(): drive_v3.Drive {
  if (!_driveClient) {
    const credentials = parseServiceAccountJson();
    const auth = new google.auth.GoogleAuth({
      credentials,
      scopes: ["https://www.googleapis.com/auth/drive"],
    });
    _driveClient = google.drive({ version: "v3", auth });
  }
  return _driveClient;
}

function getFolderId(): string {
  if (!_folderId) {
    _folderId = resolveFolderId();
  }
  return _folderId;
}

// ── Public API ────────────────────────────────────────────────────────────────

export async function uploadFileToDrive(
  buffer: Buffer,
  fileName: string,
  mimeType: string
): Promise<{ url: string; fileId: string }> {
  const drive = getDriveClient();
  const folderId = getFolderId();

  const res = await drive.files.create({
    supportsAllDrives: true,
    requestBody: {
      name: fileName,
      parents: [folderId],
    },
    media: {
      mimeType,
      body: Readable.from(buffer),
    },
    fields: "id",
  });

  const fileId = res.data.id!;

  await drive.permissions.create({
    fileId,
    supportsAllDrives: true,
    requestBody: { role: "reader", type: "anyone" },
  });

  return {
    fileId,
    url: `https://drive.google.com/file/d/${fileId}/view`,
  };
}

export async function deleteFileFromDrive(fileId: string): Promise<void> {
  try {
    const drive = getDriveClient();
    await drive.files.delete({ fileId, supportsAllDrives: true });
  } catch {
    // Silent fail — file may already be deleted or inaccessible
  }
}

export function extractFileId(driveUrl: string): string | null {
  const m = driveUrl.match(/\/d\/([a-zA-Z0-9_-]+)/);
  return m?.[1] ?? null;
}

export function isDriveConfigured(): boolean {
  return !!(
    process.env.GOOGLE_SERVICE_ACCOUNT_JSON &&
    process.env.GOOGLE_DRIVE_FOLDER_ID
  );
}
