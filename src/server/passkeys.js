import crypto from "node:crypto";
import {
  generateAuthenticationOptions,
  generateRegistrationOptions,
  verifyAuthenticationResponse,
  verifyRegistrationResponse
} from "@simplewebauthn/server";

const CHALLENGE_TTL_MS = 5 * 60 * 1000;

function authError(status, code, message) {
  return Object.assign(new Error(message), { status, code });
}

function cleanDeviceName(value, userAgent = "") {
  const submitted = String(value || "").trim().replace(/\s+/g, " ").slice(0, 80);
  if (submitted) return submitted;
  const ua = String(userAgent || "");
  const device = /iPhone/i.test(ua) ? "iPhone" : /iPad/i.test(ua) ? "iPad" : /Macintosh|Mac OS/i.test(ua) ? "Mac" : /Android/i.test(ua) ? "Android-Gerät" : "Persönliches Gerät";
  const browser = /Edg\//i.test(ua) ? "Edge" : /Chrome\//i.test(ua) && !/Chromium/i.test(ua) ? "Chrome" : /Safari\//i.test(ua) && !/Chrome\//i.test(ua) ? "Safari" : /Firefox\//i.test(ua) ? "Firefox" : "Browser";
  return `${device} · ${browser}`;
}

function activeCredentials(data) {
  return data.credentials.filter(item => !item.revokedAt);
}

export function createPasskeyService({ store, env, implementation = {} }) {
  const webauthn = {
    generateAuthenticationOptions: implementation.generateAuthenticationOptions || generateAuthenticationOptions,
    generateRegistrationOptions: implementation.generateRegistrationOptions || generateRegistrationOptions,
    verifyAuthenticationResponse: implementation.verifyAuthenticationResponse || verifyAuthenticationResponse,
    verifyRegistrationResponse: implementation.verifyRegistrationResponse || verifyRegistrationResponse
  };

  function relyingParty(req) {
    const rpID = String(env.PASSKEY_RP_ID || req.hostname || "localhost").trim().toLowerCase();
    const origin = String(env.PASSKEY_ORIGIN || `${req.protocol}://${req.get("host")}`).trim().replace(/\/$/, "");
    return { rpID, origin, rpName: String(env.PASSKEY_RP_NAME || "Olafs Reha-Kompass").slice(0, 80) };
  }

  async function status() {
    const data = await store.readAuthData();
    return { configured: activeCredentials(data).length > 0, count: activeCredentials(data).length };
  }

  async function storeChallenge(record) {
    await store.mutateAuthData(data => {
      const now = Date.now();
      data.challenges = data.challenges
        .filter(item => Number(new Date(item.expiresAt)) > now)
        .slice(-19);
      data.challenges.push(record);
    });
  }

  async function consumeChallenge(flowId, type, sessionId = null) {
    return store.mutateAuthData(data => {
      const index = data.challenges.findIndex(item => item.id === flowId && item.type === type);
      if (index < 0) throw authError(400, "PASSKEY_CHALLENGE_INVALID", "Die Sicherheitsbestätigung ist abgelaufen. Bitte beginne erneut.");
      const [record] = data.challenges.splice(index, 1);
      if (Number(new Date(record.expiresAt)) <= Date.now()) throw authError(400, "PASSKEY_CHALLENGE_EXPIRED", "Die Sicherheitsbestätigung ist abgelaufen. Bitte beginne erneut.");
      if (sessionId && record.sessionId !== sessionId) throw authError(403, "PASSKEY_CHALLENGE_REJECTED", "Die Sicherheitsbestätigung gehört nicht zu dieser Sitzung.");
      return record;
    });
  }

  async function registrationOptions({ req, session, deviceName }) {
    if (!session) throw authError(401, "SESSION_REQUIRED", "Bitte bestätige zuerst deinen bestehenden Zugang.");
    const rp = relyingParty(req);
    let owner;
    let credentials;
    await store.mutateAuthData(data => {
      if (!data.owner) {
        data.owner = {
          id: "personal-pilot",
          webauthnUserID: crypto.randomBytes(32).toString("base64url"),
          createdAt: new Date().toISOString()
        };
      }
      owner = { ...data.owner };
      credentials = activeCredentials(data).map(item => ({ id: item.id, transports: item.transports || [] }));
    });
    const options = await webauthn.generateRegistrationOptions({
      rpName: rp.rpName,
      rpID: rp.rpID,
      userID: new Uint8Array(Buffer.from(owner.webauthnUserID, "base64url")),
      userName: "olaf",
      userDisplayName: "Olaf Tiehen",
      attestationType: "none",
      excludeCredentials: credentials,
      authenticatorSelection: {
        residentKey: "required",
        userVerification: "required"
      },
      preferredAuthenticatorType: "localDevice",
      supportedAlgorithmIDs: [-7, -257],
      timeout: 120_000
    });
    const flowId = crypto.randomUUID();
    await storeChallenge({
      id: flowId,
      type: "registration",
      challenge: options.challenge,
      sessionId: session.id,
      deviceName: cleanDeviceName(deviceName, req.get("user-agent")),
      createdAt: new Date().toISOString(),
      expiresAt: new Date(Date.now() + CHALLENGE_TTL_MS).toISOString(),
      rpID: rp.rpID,
      origin: rp.origin
    });
    return { flowId, options };
  }

  async function verifyRegistration({ req, session, flowId, response }) {
    const challenge = await consumeChallenge(String(flowId || ""), "registration", session?.id);
    let verification;
    try {
      verification = await webauthn.verifyRegistrationResponse({
        response,
        expectedChallenge: challenge.challenge,
        expectedOrigin: challenge.origin,
        expectedRPID: challenge.rpID,
        requireUserPresence: true,
        requireUserVerification: true,
        supportedAlgorithmIDs: [-7, -257]
      });
    } catch {
      throw authError(400, "PASSKEY_REGISTRATION_FAILED", "Der persönliche Zugang konnte nicht bestätigt werden. Bitte versuche es erneut.");
    }
    if (!verification?.verified || !verification.registrationInfo) throw authError(400, "PASSKEY_REGISTRATION_FAILED", "Der persönliche Zugang konnte nicht bestätigt werden. Bitte versuche es erneut.");
    const info = verification.registrationInfo;
    const credential = info.credential;
    const deviceId = crypto.randomUUID();
    const now = new Date().toISOString();
    const record = {
      deviceId,
      id: credential.id,
      publicKey: Buffer.from(credential.publicKey).toString("base64url"),
      counter: Number(credential.counter || 0),
      transports: Array.isArray(credential.transports) ? credential.transports : [],
      deviceType: info.credentialDeviceType,
      backedUp: Boolean(info.credentialBackedUp),
      name: challenge.deviceName,
      createdAt: now,
      lastUsedAt: now,
      revokedAt: null,
      lastUserAgent: String(req.get("user-agent") || "").slice(0, 240)
    };
    await store.mutateAuthData(data => {
      if (data.credentials.some(item => item.id === record.id && !item.revokedAt)) throw authError(409, "PASSKEY_ALREADY_REGISTERED", "Dieser persönliche Zugang ist bereits eingerichtet.");
      data.credentials.push(record);
    });
    return record;
  }

  async function authenticationOptions({ req }) {
    const data = await store.readAuthData();
    const credentials = activeCredentials(data);
    if (!credentials.length) throw authError(409, "PASSKEY_NOT_CONFIGURED", "Auf diesem System wurde noch kein Passkey eingerichtet.");
    const rp = relyingParty(req);
    const options = await webauthn.generateAuthenticationOptions({
      rpID: rp.rpID,
      allowCredentials: credentials.map(item => ({ id: item.id, transports: item.transports || [] })),
      userVerification: "required",
      timeout: 120_000
    });
    const flowId = crypto.randomUUID();
    await storeChallenge({
      id: flowId,
      type: "authentication",
      challenge: options.challenge,
      createdAt: new Date().toISOString(),
      expiresAt: new Date(Date.now() + CHALLENGE_TTL_MS).toISOString(),
      rpID: rp.rpID,
      origin: rp.origin
    });
    return { flowId, options };
  }

  async function verifyAuthentication({ req, flowId, response }) {
    const challenge = await consumeChallenge(String(flowId || ""), "authentication");
    const credentialId = String(response?.id || "");
    const data = await store.readAuthData();
    const stored = data.credentials.find(item => item.id === credentialId && !item.revokedAt);
    if (!stored) throw authError(401, "PASSKEY_UNKNOWN", "Dieses Gerät ist nicht mehr freigegeben.");
    let verification;
    try {
      verification = await webauthn.verifyAuthenticationResponse({
        response,
        expectedChallenge: challenge.challenge,
        expectedOrigin: challenge.origin,
        expectedRPID: challenge.rpID,
        requireUserVerification: true,
        credential: {
          id: stored.id,
          publicKey: new Uint8Array(Buffer.from(stored.publicKey, "base64url")),
          counter: Number(stored.counter || 0),
          transports: stored.transports || []
        }
      });
    } catch {
      throw authError(401, "PASSKEY_AUTHENTICATION_FAILED", "Die persönliche Bestätigung war nicht erfolgreich. Bitte versuche es erneut.");
    }
    if (!verification?.verified) throw authError(401, "PASSKEY_AUTHENTICATION_FAILED", "Die persönliche Bestätigung war nicht erfolgreich. Bitte versuche es erneut.");
    const now = new Date().toISOString();
    await store.mutateAuthData(auth => {
      const record = auth.credentials.find(item => item.id === stored.id && !item.revokedAt);
      if (!record) throw authError(401, "PASSKEY_REVOKED", "Dieses Gerät ist nicht mehr freigegeben.");
      record.counter = Number(verification.authenticationInfo?.newCounter ?? record.counter);
      record.lastUsedAt = now;
      record.lastUserAgent = String(req.get("user-agent") || "").slice(0, 240);
    });
    return { ...stored, counter: Number(verification.authenticationInfo?.newCounter ?? stored.counter), lastUsedAt: now };
  }

  async function devices(currentSession) {
    const data = await store.readAuthData();
    return activeCredentials(data).map(item => ({
      id: item.deviceId,
      name: item.name,
      deviceType: item.deviceType,
      backedUp: Boolean(item.backedUp),
      createdAt: item.createdAt,
      lastUsedAt: item.lastUsedAt,
      current: item.id === currentSession?.credentialId
    }));
  }

  async function revokeDevice(deviceId, { currentSession, allowCodeLogin }) {
    return store.mutateAuthData(data => {
      const credential = data.credentials.find(item => item.deviceId === deviceId && !item.revokedAt);
      if (!credential) throw authError(404, "PASSKEY_DEVICE_NOT_FOUND", "Der bestätigte Zugang wurde nicht gefunden.");
      if (activeCredentials(data).length === 1 && !allowCodeLogin) throw authError(409, "LAST_PASSKEY_REQUIRED", "Der letzte Passkey kann erst entfernt werden, wenn ein weiterer persönlicher Zugang eingerichtet wurde.");
      const now = new Date().toISOString();
      credential.revokedAt = now;
      for (const session of data.sessions) {
        if (session.credentialId === credential.id && !session.revokedAt) session.revokedAt = now;
      }
      return { removed: true, current: currentSession?.credentialId === credential.id };
    });
  }

  return {
    status,
    registrationOptions,
    verifyRegistration,
    authenticationOptions,
    verifyAuthentication,
    devices,
    revokeDevice
  };
}
