import {
  getSessionMaxAgeSeconds,
  getSessionSecret,
  SESSION_COOKIE_NAME,
} from "@/lib/auth/config";
import { decodeJson, encodeJson, signPayload, verifyPayload } from "@/lib/auth/crypto";

/** Claim minimi: ruolo, stato, username e preferenze si leggono dal DB, mai dal cookie (T-501). */
export type SessionPayload = {
  uid: string;
  ver: number;
  iat: number;
  exp: number;
};

const PAYLOAD_KEYS = ["exp", "iat", "uid", "ver"];

export { SESSION_COOKIE_NAME };

export async function createSessionToken(input: { userId: string; sessionVersion: number }): Promise<string> {
  const nowSeconds = Math.floor(Date.now() / 1000);
  const payload: SessionPayload = {
    uid: input.userId,
    ver: input.sessionVersion,
    iat: nowSeconds,
    exp: nowSeconds + getSessionMaxAgeSeconds(),
  };

  const payloadPart = encodeJson(payload);
  const signature = await signPayload(payloadPart, getSessionSecret());
  return `${payloadPart}.${signature}`;
}

/** Solo l'oggetto con esattamente uid, ver, iat ed exp dei tipi attesi: il vecchio formato non passa. */
function isSessionPayload(value: unknown): value is SessionPayload {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return false;
  }

  const record = value as Record<string, unknown>;
  const keys = Object.keys(record).sort();
  if (keys.length !== PAYLOAD_KEYS.length || keys.some((key, index) => key !== PAYLOAD_KEYS[index])) {
    return false;
  }

  return (
    typeof record.uid === "string" &&
    record.uid.length > 0 &&
    Number.isInteger(record.ver) &&
    Number.isInteger(record.iat) &&
    Number.isInteger(record.exp)
  );
}

export async function verifySessionToken(token: string | undefined | null): Promise<SessionPayload | null> {
  if (!token) {
    return null;
  }

  const [payloadPart, signaturePart] = token.split(".");
  if (!payloadPart || !signaturePart) {
    return null;
  }

  try {
    // Ogni errore di decodifica o verifica vale come sessione assente, mai come token valido.
    const valid = await verifyPayload(payloadPart, signaturePart, getSessionSecret());
    if (!valid) {
      return null;
    }

    const payload = decodeJson<unknown>(payloadPart);
    if (!isSessionPayload(payload)) {
      return null;
    }

    const nowSeconds = Math.floor(Date.now() / 1000);
    if (payload.exp <= nowSeconds) {
      return null;
    }

    return payload;
  } catch {
    return null;
  }
}
