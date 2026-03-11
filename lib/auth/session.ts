import {
  getSessionMaxAgeSeconds,
  getSessionSecret,
  SESSION_COOKIE_NAME,
} from "@/lib/auth/config";
import { decodeJson, encodeJson, signPayload, verifyPayload } from "@/lib/auth/crypto";

type SessionPayload = {
  username: string;
  exp: number;
};

export { SESSION_COOKIE_NAME };

export async function createSessionToken(username: string): Promise<string> {
  const nowSeconds = Math.floor(Date.now() / 1000);
  const payload: SessionPayload = {
    username,
    exp: nowSeconds + getSessionMaxAgeSeconds(),
  };

  const payloadPart = encodeJson(payload);
  const signature = await signPayload(payloadPart, getSessionSecret());
  return `${payloadPart}.${signature}`;
}

export async function verifySessionToken(token: string | undefined | null): Promise<SessionPayload | null> {
  if (!token) {
    return null;
  }

  const [payloadPart, signaturePart] = token.split(".");
  if (!payloadPart || !signaturePart) {
    return null;
  }

  const valid = await verifyPayload(payloadPart, signaturePart, getSessionSecret());
  if (!valid) {
    return null;
  }

  try {
    const payload = decodeJson<SessionPayload>(payloadPart);
    const nowSeconds = Math.floor(Date.now() / 1000);
    if (!payload.exp || payload.exp <= nowSeconds) {
      return null;
    }

    return payload;
  } catch {
    return null;
  }
}
