import { ColorVisionMode, FontScaleMode, ThemeMode, UserRole, UserStatus } from "@/lib/generated/prisma/enums";
import {
  getSessionMaxAgeSeconds,
  getSessionSecret,
  SESSION_COOKIE_NAME,
} from "@/lib/auth/config";
import { decodeJson, encodeJson, signPayload, verifyPayload } from "@/lib/auth/crypto";

export type SessionPayload = {
  userId: string;
  username: string;
  role?: UserRole;
  status?: UserStatus;
  isRootAdmin?: boolean;
  themeMode?: ThemeMode;
  fontScaleMode?: FontScaleMode;
  colorVisionMode?: ColorVisionMode;
  exp: number;
};

export { SESSION_COOKIE_NAME };

export async function createSessionToken(input: {
  userId: string;
  username: string;
  role: UserRole;
  status: UserStatus;
  isRootAdmin: boolean;
  themeMode: ThemeMode;
  fontScaleMode: FontScaleMode;
  colorVisionMode: ColorVisionMode;
}): Promise<string> {
  const nowSeconds = Math.floor(Date.now() / 1000);
  const payload: SessionPayload = {
    userId: input.userId,
    username: input.username,
    role: input.role,
    status: input.status,
    isRootAdmin: input.isRootAdmin,
    themeMode: input.themeMode,
    fontScaleMode: input.fontScaleMode,
    colorVisionMode: input.colorVisionMode,
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

  try {
    // Ogni errore di decodifica o verifica vale come sessione assente, mai come token valido.
    const valid = await verifyPayload(payloadPart, signaturePart, getSessionSecret());
    if (!valid) {
      return null;
    }

    const payload = decodeJson<SessionPayload>(payloadPart);
    const nowSeconds = Math.floor(Date.now() / 1000);

    if (!payload.exp || payload.exp <= nowSeconds) {
      return null;
    }

    if (!payload.userId || !payload.username) {
      return null;
    }

    return payload;
  } catch {
    return null;
  }
}