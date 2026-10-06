const BOOLEAN_WORDS = new Map<string, boolean>([
  ["true", true],
  ["1", true],
  ["yes", true],
  ["on", true],
  ["false", false],
  ["0", false],
  ["no", false],
  ["off", false],
]);

/** Booleano o parola booleana riconosciuta (true/1/yes/on, false/0/no/off, maiuscole ammesse); altrimenti undefined. */
export function parseBooleanWord(value: unknown): boolean | undefined {
  if (typeof value === "boolean") return value;
  return BOOLEAN_WORDS.get(String(value).toLowerCase());
}

/** Flag permissivo: null o undefined → defaultValue; true solo per true e per le parole 1, true, yes, on. */
export function parseBoolean(value: unknown, defaultValue = false): boolean {
  if (value == null) {
    return defaultValue;
  }

  return parseBooleanWord(value) === true;
}

export function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

export function toNumber(value: string | null | undefined): number | undefined {
  if (!value) {
    return undefined;
  }

  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

export function splitLines(raw: string): string[] {
  return raw
    .split(/\r?\n|,|;/)
    .map((item) => item.trim())
    .filter(Boolean);
}
