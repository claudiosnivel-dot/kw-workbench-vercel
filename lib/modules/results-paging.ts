import { readParam, type SearchParamsSource } from "@/lib/http/search-params";

/**
 * Parametri di paginazione dei risultati (T-801, D-23), unici per la pagina dei risultati e l'API.
 * Valori vuoti, non numerici, zero o negativi tornano al default; i decimali si troncano; pageSize
 * resta nel range PAGE_SIZE_MIN..PAGE_SIZE_MAX anche lato server.
 */
export const PAGE_SIZE_DEFAULT = 100;
export const PAGE_SIZE_MIN = 20;
export const PAGE_SIZE_MAX = 250;

export type PagingParams = { page: number; pageSize: number };

function positiveIntOr(raw: string, fallback: number): number {
  // Number("") vale 0: il vuoto ricade nel default come zero e negativi.
  const parsed = Math.trunc(Number(raw));
  return Number.isFinite(parsed) && parsed >= 1 ? parsed : fallback;
}

export function parsePagingParams(source: SearchParamsSource): PagingParams {
  const pageSize = positiveIntOr(readParam(source, "pageSize"), PAGE_SIZE_DEFAULT);

  return {
    page: positiveIntOr(readParam(source, "page"), 1),
    pageSize: Math.min(PAGE_SIZE_MAX, Math.max(PAGE_SIZE_MIN, pageSize)),
  };
}

/** Nuovo URLSearchParams con page/pageSize sostituiti; gli altri parametri e l'originale restano invariati. */
export function withPaging(params: URLSearchParams, overrides: Partial<PagingParams>): URLSearchParams {
  const next = new URLSearchParams(params);
  if (overrides.page !== undefined) {
    next.set("page", String(overrides.page));
  }
  if (overrides.pageSize !== undefined) {
    next.set("pageSize", String(overrides.pageSize));
  }
  return next;
}
