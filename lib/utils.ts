export function parseBoolean(value: string | null | undefined, defaultValue = false): boolean {
  if (value == null) {
    return defaultValue;
  }

  return ["1", "true", "yes", "on"].includes(value.toLowerCase());
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
