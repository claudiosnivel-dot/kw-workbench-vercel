const FALLBACK_CHARSETS = ["utf-8", "windows-1252", "iso-8859-1"] as const;
const MOJIBAKE_PATTERN = /(?:\u00C3.|\u00C2.|\u00E2.|\u00F0|\u00D0|\uFFFD)/;
const XSSI_PREFIX = /^\)\]\}'\s*/;

function normalizeCharsetLabel(value: string): string {
  const label = value.trim().toLowerCase();

  if (label === "utf8") return "utf-8";
  if (label === "latin1") return "iso-8859-1";
  if (label === "latin-1") return "iso-8859-1";
  if (label === "cp1252") return "windows-1252";
  if (label === "windows1252") return "windows-1252";

  return label;
}

function parseCharset(contentType: string | null): string | null {
  if (!contentType) {
    return null;
  }

  const match = contentType.match(/charset\s*=\s*["']?([^;"'\s]+)/i);
  if (!match?.[1]) {
    return null;
  }

  return normalizeCharsetLabel(match[1]);
}

function textNoiseScore(value: string): number {
  const replacementChars = (value.match(/\uFFFD/g) || []).length;
  const controlChars = (value.match(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g) || []).length;
  const mojibakeHits = (value.match(/(?:\u00C3.|\u00C2.|\u00E2.|\u00F0|\u00D0)/g) || []).length;

  return replacementChars * 100 + controlChars * 10 + mojibakeHits * 5;
}

function decodeWithCharset(bytes: Uint8Array, charset: string): string | null {
  try {
    return new TextDecoder(charset).decode(bytes);
  } catch {
    return null;
  }
}

function buildCharsetCandidates(contentType: string | null): string[] {
  const ordered = new Set<string>();
  const declared = parseCharset(contentType);

  if (declared) {
    ordered.add(declared);
  }

  for (const fallback of FALLBACK_CHARSETS) {
    ordered.add(fallback);
  }

  return Array.from(ordered);
}

function looksLikeMojibake(value: string): boolean {
  return MOJIBAKE_PATTERN.test(value);
}

function decodeUtf8FromLatin1Bytes(input: string): string | null {
  const bytes = new Uint8Array(input.length);

  for (let index = 0; index < input.length; index += 1) {
    const code = input.charCodeAt(index);
    if (code > 0xff) {
      return null;
    }
    bytes[index] = code;
  }

  return new TextDecoder("utf-8").decode(bytes);
}

export function decodeResponseText(buffer: ArrayBuffer, contentType: string | null): string {
  const bytes = new Uint8Array(buffer);
  const candidates = buildCharsetCandidates(contentType);

  let best = "";
  let bestScore = Number.POSITIVE_INFINITY;

  for (const charset of candidates) {
    const decoded = decodeWithCharset(bytes, charset);
    if (decoded === null) {
      continue;
    }

    const score = textNoiseScore(decoded);
    if (score < bestScore) {
      best = decoded;
      bestScore = score;
    }
  }

  if (!best && bytes.length > 0) {
    return new TextDecoder("utf-8").decode(bytes);
  }

  return best;
}

export function parseJsonWithXssiGuard(input: string): unknown {
  const trimmed = input.trim().replace(XSSI_PREFIX, "");
  return JSON.parse(trimmed);
}

export function repairCommonMojibake(input: string): string {
  if (!looksLikeMojibake(input)) {
    return input.normalize("NFC");
  }

  const repaired = decodeUtf8FromLatin1Bytes(input);
  if (!repaired) {
    return input.normalize("NFC");
  }

  const currentScore = textNoiseScore(input);
  const repairedScore = textNoiseScore(repaired);
  return repairedScore <= currentScore ? repaired.normalize("NFC") : input.normalize("NFC");
}

export function normalizeDisplayText(input: string): string {
  const compact = input.replace(/\s+/g, " ").trim();
  if (!compact) {
    return "";
  }

  return repairCommonMojibake(compact).normalize("NFC");
}
