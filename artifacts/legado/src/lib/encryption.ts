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

async function importKey(keyStr: string): Promise<CryptoKey> {
  let keyBytes: Uint8Array;
  if (/^[0-9a-fA-F]{64}$/.test(keyStr)) {
    const hex = keyStr;
    keyBytes = new Uint8Array(32);
    for (let i = 0; i < 32; i++) {
      keyBytes[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
    }
  } else {
    keyBytes = Uint8Array.from(atob(keyStr), (c) => c.charCodeAt(0));
  }
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
