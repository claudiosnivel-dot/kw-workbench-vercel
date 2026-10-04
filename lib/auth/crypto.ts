const encoder = new TextEncoder();
const decoder = new TextDecoder();

function toBase64Url(input: Uint8Array): string {
  let binary = "";
  for (const byte of input) {
    binary += String.fromCharCode(byte);
  }

  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

const BASE64URL_PATTERN = /^[A-Za-z0-9_-]*$/;

function fromBase64Url(input: string): Uint8Array {
  // atob lancia su caratteri fuori alfabeto: l'input (cookie del client) si valida prima.
  if (!BASE64URL_PATTERN.test(input)) {
    throw new Error("Valore base64url non valido");
  }

  const normalized = input.replace(/-/g, "+").replace(/_/g, "/");
  const padding = normalized.length % 4 === 0 ? "" : "=".repeat(4 - (normalized.length % 4));
  const binary = atob(normalized + padding);
  const bytes = new Uint8Array(binary.length);

  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i);
  }

  return bytes;
}

async function getHmacKey(secret: string): Promise<CryptoKey> {
  return crypto.subtle.importKey("raw", encoder.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, [
    "sign",
    "verify",
  ]);
}

export async function signPayload(payload: string, secret: string): Promise<string> {
  const key = await getHmacKey(secret);
  const signature = await crypto.subtle.sign("HMAC", key, encoder.encode(payload));
  return toBase64Url(new Uint8Array(signature));
}

export async function verifyPayload(payload: string, signature: string, secret: string): Promise<boolean> {
  const key = await getHmacKey(secret);
  return crypto.subtle.verify("HMAC", key, fromBase64Url(signature), encoder.encode(payload));
}

export function encodeJson(data: object): string {
  return toBase64Url(encoder.encode(JSON.stringify(data)));
}

export function decodeJson<T>(tokenPart: string): T {
  const json = decoder.decode(fromBase64Url(tokenPart));
  return JSON.parse(json) as T;
}
