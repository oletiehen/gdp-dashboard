function bytesToBase64(bytes) {
  let binary = "";
  for (let offset = 0; offset < bytes.length; offset += 0x8000) binary += String.fromCharCode(...bytes.subarray(offset, offset + 0x8000));
  return btoa(binary);
}

function base64ToBytes(value) {
  const binary = atob(value);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
  return bytes;
}

export async function deriveVaultKey(secret, saltBase64) {
  if (!secret || !saltBase64) throw new Error("Der verschlüsselte Speicher kann ohne Zugangscode nicht geöffnet werden.");
  const material = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), "PBKDF2", false, ["deriveKey"]);
  return crypto.subtle.deriveKey({ name: "PBKDF2", hash: "SHA-256", salt: base64ToBytes(saltBase64), iterations: 310_000 }, material, { name: "AES-GCM", length: 256 }, false, ["encrypt", "decrypt"]);
}

export async function importVaultKey(keyBase64) {
  if (!keyBase64) throw new Error("Der sichere Sitzungsschlüssel fehlt.");
  return crypto.subtle.importKey("raw", base64ToBytes(keyBase64), { name: "AES-GCM" }, false, ["encrypt", "decrypt"]);
}

export async function encryptJson(key, value) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const plaintext = new TextEncoder().encode(JSON.stringify(value));
  const ciphertext = new Uint8Array(await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, plaintext));
  return { v: 1, iv: bytesToBase64(iv), data: bytesToBase64(ciphertext) };
}

export async function decryptJson(key, envelope) {
  if (!envelope || envelope.v !== 1) throw new Error("Unbekanntes Sicherungsformat.");
  const plaintext = await crypto.subtle.decrypt({ name: "AES-GCM", iv: base64ToBytes(envelope.iv) }, key, base64ToBytes(envelope.data));
  return JSON.parse(new TextDecoder().decode(plaintext));
}

export async function encryptBytes(key, arrayBuffer) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ciphertext = new Uint8Array(await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, arrayBuffer));
  const packed = new Uint8Array(1 + iv.length + ciphertext.length);
  packed[0] = 1;
  packed.set(iv, 1);
  packed.set(ciphertext, 13);
  return packed.buffer;
}

export async function decryptBytes(key, arrayBuffer) {
  const packed = new Uint8Array(arrayBuffer);
  if (packed[0] !== 1 || packed.length < 30) throw new Error("Unbekanntes Dokumentformat.");
  return crypto.subtle.decrypt({ name: "AES-GCM", iv: packed.slice(1, 13) }, key, packed.slice(13));
}

export function base64UrlToUint8Array(value) {
  const padding = "=".repeat((4 - value.length % 4) % 4);
  return base64ToBytes(value.replace(/-/g, "+").replace(/_/g, "/") + padding);
}
