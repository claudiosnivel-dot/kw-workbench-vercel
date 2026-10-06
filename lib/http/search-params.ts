import { parseBoolean, toNumber } from "@/lib/utils";

/** searchParams di una pagina di Next. */
export type SearchParams = Record<string, string | string[] | undefined>;

/** Parametri di query da un URLSearchParams (API) o dai searchParams di una pagina. */
export type SearchParamsSource = URLSearchParams | SearchParams;

/** Primo valore del parametro; stringa vuota se manca. */
export function readParam(source: SearchParamsSource, key: string): string {
  if (source instanceof URLSearchParams) {
    return source.get(key) ?? "";
  }

  const value = source[key];
  return (Array.isArray(value) ? value[0] : value) ?? "";
}

/** Flag del parametro: true solo per 1, true, yes, on (parseBoolean). */
export function readFlag(source: SearchParamsSource, key: string): boolean {
  return parseBoolean(readParam(source, key));
}

/** Numero finito del parametro; undefined se vuoto o non numerico (toNumber). */
export function readNumber(source: SearchParamsSource, key: string): number | undefined {
  return toNumber(readParam(source, key));
}
