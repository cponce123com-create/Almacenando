const ENC_KEY_STORAGE = "legado_enc_key";

export function storeEncryptionKey(key: string): void {
  sessionStorage.setItem(ENC_KEY_STORAGE, key);
}

export function getEncryptionKey(): string | null {
  return sessionStorage.getItem(ENC_KEY_STORAGE);
}

export function clearEncryptionKey(): void {
  sessionStorage.removeItem(ENC_KEY_STORAGE);
}

async function importKey(base64Key: string): Promise<CryptoKey> {
  const keyBytes = Uint8Array.from(atob(base64Key), (c) => c.charCodeAt(0));
  return crypto.subtle.importKey("raw", keyBytes, { name: "AES-GCM" }, false, [
    "encrypt",
    "decrypt",
  ]);
}

export async function encryptFile(
  file: File,
  base64Key: string
): Promise<{ encryptedBlob: Blob; ivBase64: string }> {
  const cryptoKey = await importKey(base64Key);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const fileBuffer = await file.arrayBuffer();
  const encryptedBuffer = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv },
    cryptoKey,
    fileBuffer
  );
  const ivBase64 = btoa(String.fromCharCode(...iv));
  const encryptedBlob = new Blob([encryptedBuffer], {
    type: "application/octet-stream",
  });
  return { encryptedBlob, ivBase64 };
}

export async function decryptFile(
  encryptedBuffer: ArrayBuffer,
  base64Key: string,
  ivBase64: string
): Promise<ArrayBuffer> {
  const cryptoKey = await importKey(base64Key);
  const iv = Uint8Array.from(atob(ivBase64), (c) => c.charCodeAt(0));
  return crypto.subtle.decrypt({ name: "AES-GCM", iv }, cryptoKey, encryptedBuffer);
}
