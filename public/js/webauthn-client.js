function fromBase64Url(value) {
  const padding = "=".repeat((4 - value.length % 4) % 4);
  const binary = atob(value.replace(/-/g, "+").replace(/_/g, "/") + padding);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
  return bytes;
}

function toBase64Url(value) {
  const bytes = new Uint8Array(value);
  let binary = "";
  for (let offset = 0; offset < bytes.length; offset += 0x8000) binary += String.fromCharCode(...bytes.subarray(offset, offset + 0x8000));
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function supported() {
  return Boolean(window.PublicKeyCredential && navigator.credentials?.create && navigator.credentials?.get);
}

function clientError(error) {
  if (error?.name === "NotAllowedError") return new Error("Die persönliche Bestätigung wurde abgebrochen oder ist abgelaufen.");
  if (error?.name === "InvalidStateError") return new Error("Dieser Passkey ist auf dem Gerät bereits eingerichtet.");
  if (error?.name === "SecurityError") return new Error("Der sichere Gerätezugang ist für diese Adresse nicht verfügbar.");
  return new Error("Face ID, Touch ID oder der Gerätecode konnte nicht verwendet werden.");
}

export function passkeySupported() {
  return supported();
}

export async function createPasskey(options) {
  if (!supported()) throw new Error("Dieser Browser unterstützt den sicheren Passkey-Zugang nicht.");
  const publicKey = {
    ...options,
    challenge: fromBase64Url(options.challenge),
    user: { ...options.user, id: fromBase64Url(options.user.id) },
    excludeCredentials: (options.excludeCredentials || []).map(item => ({ ...item, id: fromBase64Url(item.id) }))
  };
  let credential;
  try {
    credential = await navigator.credentials.create({ publicKey });
  } catch (error) {
    throw clientError(error);
  }
  if (!credential) throw new Error("Der Passkey wurde nicht erstellt.");
  return {
    id: credential.id,
    rawId: toBase64Url(credential.rawId),
    type: credential.type,
    authenticatorAttachment: credential.authenticatorAttachment || undefined,
    clientExtensionResults: credential.getClientExtensionResults(),
    response: {
      attestationObject: toBase64Url(credential.response.attestationObject),
      clientDataJSON: toBase64Url(credential.response.clientDataJSON),
      transports: credential.response.getTransports?.() || []
    }
  };
}

export async function authenticatePasskey(options) {
  if (!supported()) throw new Error("Dieser Browser unterstützt den sicheren Passkey-Zugang nicht.");
  const publicKey = {
    ...options,
    challenge: fromBase64Url(options.challenge),
    allowCredentials: (options.allowCredentials || []).map(item => ({ ...item, id: fromBase64Url(item.id) }))
  };
  let credential;
  try {
    credential = await navigator.credentials.get({ publicKey });
  } catch (error) {
    throw clientError(error);
  }
  if (!credential) throw new Error("Der Passkey wurde nicht bestätigt.");
  return {
    id: credential.id,
    rawId: toBase64Url(credential.rawId),
    type: credential.type,
    authenticatorAttachment: credential.authenticatorAttachment || undefined,
    clientExtensionResults: credential.getClientExtensionResults(),
    response: {
      authenticatorData: toBase64Url(credential.response.authenticatorData),
      clientDataJSON: toBase64Url(credential.response.clientDataJSON),
      signature: toBase64Url(credential.response.signature),
      userHandle: credential.response.userHandle ? toBase64Url(credential.response.userHandle) : undefined
    }
  };
}
