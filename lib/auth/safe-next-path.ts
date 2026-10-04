// Destinazione dopo login e registrazione (T-303): solo percorsi della stessa origine.
// Senza import, così la usano sia i server component sia i client component.

const MAX_NEXT_PATH_LENGTH = 2048;
const PROBE_ORIGIN = "http://n.invalid";

function hasControlCharacter(value: string): boolean {
  for (let index = 0; index < value.length; index += 1) {
    const code = value.charCodeAt(index);
    if (code <= 31 || code === 127) {
      return true;
    }
  }
  return false;
}

/** Restituisce value se è un percorso relativo della stessa origine, altrimenti "/". */
export function safeNextPath(value: unknown): string {
  if (
    typeof value !== "string" ||
    value.length > MAX_NEXT_PATH_LENGTH ||
    value[0] !== "/" ||
    value[1] === "/" ||
    value.includes("\\") ||
    hasControlCharacter(value)
  ) {
    return "/";
  }

  try {
    return new URL(value, PROBE_ORIGIN).origin === PROBE_ORIGIN ? value : "/";
  } catch {
    return "/";
  }
}
