import { google } from "googleapis";
import { Readable } from "stream";
import type { drive_v3 } from "googleapis";

// ── Singleton state ───────────────────────────────────────────────────────────
// Parsed once on first use; never re-created per-request.

let _driveClient: drive_v3.Drive | null = null;
let _photosFolderId: string | null = null;
let _msdsFolderId: string | null = null;

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

function resolvePhotosFolderId() {
  // Prefer dedicated env var; fall back to legacy GOOGLE_DRIVE_FOLDER_ID
  const raw =
    process.env.GOOGLE_DRIVE_PHOTOS_FOLDER_ID ??
    process.env.GOOGLE_DRIVE_FOLDER_ID;
  if (!raw) throw new Error("GOOGLE_DRIVE_PHOTOS_FOLDER_ID no está configurado");
  const trimmed = raw.trim();
  const match = trimmed.match(/folders\/([a-zA-Z0-9_-]+)/);
  return match ? match[1]! : trimmed;
}

function resolveMsdsFolderId() {
  const raw = process.env.GOOGLE_DRIVE_MSDS_FOLDER_ID;
  if (!raw) throw new Error("GOOGLE_DRIVE_MSDS_FOLDER_ID no está configurado");
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

function getPhotosFolderId(): string {
  if (!_photosFolderId) {
    _photosFolderId = resolvePhotosFolderId();
  }
  return _photosFolderId;
}

function getMsdsFolderId(): string {
  if (!_msdsFolderId) {
    _msdsFolderId = resolveMsdsFolderId();
  }
  return _msdsFolderId;
}

// ── MSDS Drive file metadata ──────────────────────────────────────────────────

export interface MsdsDriveFile {
  fileId: string;
  name: string;
  link: string;
  folderName: string;
  modifiedTime: string;
}

/**
 * Recursively lists all PDF files inside the MSDS folder (and subfolders).
 * Returns full metadata: fileId, name, link, folderName, modifiedTime.
 */
export async function getDriveMsdsFiles(): Promise<MsdsDriveFile[]> {
  const drive = getDriveClient();
  const rootId = getMsdsFolderId();
  const results: MsdsDriveFile[] = [];

  async function listFolder(folderId: string, folderName: string) {
    let pageToken: string | undefined;
    do {
      const res = await drive.files.list({
        q: `'${folderId}' in parents and trashed = false`,
        fields: "nextPageToken, files(id, name, mimeType, modifiedTime, webViewLink)",
        pageSize: 500,
        supportsAllDrives: true,
        includeItemsFromAllDrives: true,
        ...(pageToken ? { pageToken } : {}),
      });
      const files = res.data.files ?? [];
      pageToken = res.data.nextPageToken ?? undefined;

      for (const file of files) {
        if (!file.id || !file.name) continue;
        if (file.mimeType === "application/vnd.google-apps.folder") {
          await listFolder(file.id, file.name);
        } else if (
          file.mimeType === "application/pdf" ||
          file.name.toLowerCase().endsWith(".pdf")
        ) {
          results.push({
            fileId: file.id,
            name: file.name,
            link: file.webViewLink ?? `https://drive.google.com/file/d/${file.id}/view`,
            folderName,
            modifiedTime: file.modifiedTime ?? "",
          });
        }
      }
    } while (pageToken);
  }

  await listFolder(rootId, "ROOT");
  return results;
}

// ── Public API ────────────────────────────────────────────────────────────────

export async function uploadFileToDrive(
  buffer: Buffer,
  fileName: string,
  mimeType: string
): Promise<{ url: string; fileId: string }> {
  const drive = getDriveClient();
  const folderId = getPhotosFolderId();

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

/**
 * Downloads a file from Google Drive by fileId and returns its raw Buffer.
 * Works for PDFs and any binary file. For Google Docs, use mimeType export.
 */
export async function downloadDriveFileAsBuffer(fileId: string): Promise<{ buffer: Buffer; mimeType: string }> {
  const drive = getDriveClient();

  // Get file metadata first to know the mimeType
  const meta = await drive.files.get({
    fileId,
    fields: "mimeType, name",
    supportsAllDrives: true,
  });

  const mimeType = meta.data.mimeType ?? "application/octet-stream";

  // Google Docs → export as plain text
  if (mimeType === "application/vnd.google-apps.document") {
    const res = await drive.files.export(
      { fileId, mimeType: "text/plain" },
      { responseType: "arraybuffer" }
    );
    return { buffer: Buffer.from(res.data as ArrayBuffer), mimeType: "text/plain" };
  }

  // PDF and other files → download binary
  const res = await drive.files.get(
    { fileId, alt: "media", supportsAllDrives: true },
    { responseType: "arraybuffer" }
  );
  return { buffer: Buffer.from(res.data as ArrayBuffer), mimeType };
}

export function isDriveConfigured(): boolean {
  return !!(
    process.env.GOOGLE_SERVICE_ACCOUNT_JSON &&
    (process.env.GOOGLE_DRIVE_PHOTOS_FOLDER_ID ?? process.env.GOOGLE_DRIVE_FOLDER_ID)
  );
}

export function isMsdsDriveConfigured(): boolean {
  return !!(
    process.env.GOOGLE_SERVICE_ACCOUNT_JSON &&
    process.env.GOOGLE_DRIVE_MSDS_FOLDER_ID
  );
}
