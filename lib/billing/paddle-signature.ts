import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * Firma dei webhook di Paddle (T-1603, developer.paddle.com/webhooks/signature-verification): header Paddle-Signature
 * nel formato ts=<unix>;h1=<hex>, con più h1 durante la rotazione del segreto; payload firmato ts + ":" + corpo grezzo,
 * HMAC-SHA256 con il segreto della notification destination; confronto a tempo costante (CWE-208) e timestamp entro la
 * tolleranza contro il replay (CWE-294).
 */

export type SignatureFailure = "missing" | "malformed" | "expired" | "mismatch";

const HEX_SHA256 = /^[0-9a-f]{64}$/i;

function parseHeader(header: string): { ts: number; signatures: string[] } | null {
  let ts: number | null = null;
  const signatures: string[] = [];
  for (const part of header.split(";")) {
    const separator = part.indexOf("=");
    if (separator < 0) {
      return null;
    }
    const name = part.slice(0, separator).trim();
    const value = part.slice(separator + 1).trim();
    if (name === "ts" && /^\d{1,12}$/.test(value)) {
      ts = Number(value);
    } else if (name === "h1" && HEX_SHA256.test(value)) {
      signatures.push(value.toLowerCase());
    }
  }
  return ts === null || signatures.length === 0 ? null : { ts, signatures };
}

/** null se la firma è valida per il corpo grezzo, altrimenti il motivo (da loggare, mai il corpo né l'header). */
export function verifyPaddleSignature(input: {
  header: string | null;
  rawBody: string;
  secret: string;
  nowMs: number;
  toleranceSeconds: number;
}): SignatureFailure | null {
  if (!input.header) {
    return "missing";
  }
  const parsed = parseHeader(input.header);
  if (!parsed) {
    return "malformed";
  }
  if (Math.abs(input.nowMs / 1000 - parsed.ts) > input.toleranceSeconds) {
    return "expired";
  }

  const expected = createHmac("sha256", input.secret).update(`${parsed.ts}:${input.rawBody}`).digest();
  const matches = parsed.signatures.some((signature) => {
    const candidate = Buffer.from(signature, "hex");
    return candidate.length === expected.length && timingSafeEqual(candidate, expected);
  });
  return matches ? null : "mismatch";
}
