import type { ExportFormat, ExportScope } from "@/lib/modules/export";

/**
 * Vista dei risultati (T-802, D-21): risolta in un solo punto e riusata da tabella, conteggi, link di
 * export e pulsante Google Sheets, così la sezione mostrata è quella esportata.
 * Precedenza: view=all, poi subprojectId richiesto (una sezione di altro progetto è not-found), poi
 * default_subproject_id se appartiene al progetto, poi la prima sezione per posizione.
 */
export type ResultsView = { kind: "section"; subprojectId: string } | { kind: "all" } | { kind: "not-found" };

type ShownResultsView = Exclude<ResultsView, { kind: "not-found" }>;

type SearchParamsSource = URLSearchParams | Record<string, string | string[] | undefined>;

/** Destinazione di un link verso la pagina dei risultati: sempre con la vista dichiarata. */
export type ResultsTarget = { view: "all" } | { subprojectId: string };

/** Copia dei parametri di query (primo valore di quelli ripetuti, vuoti esclusi). */
export function toUrlSearchParams(source: SearchParamsSource): URLSearchParams {
  if (source instanceof URLSearchParams) {
    return new URLSearchParams(source);
  }

  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(source)) {
    const first = Array.isArray(value) ? value[0] : value;
    if (first) params.set(key, first);
  }
  return params;
}

export function resolveResultsView(input: {
  subprojects: { id: string; position: number }[];
  defaultSubprojectId: string | null;
  searchParams: SearchParamsSource;
}): ResultsView {
  const params = toUrlSearchParams(input.searchParams);
  if ((params.get("view") ?? "").trim().toLowerCase() === "all") {
    return { kind: "all" };
  }

  const requested = (params.get("subprojectId") ?? "").trim();
  if (requested) {
    return input.subprojects.some((section) => section.id === requested)
      ? { kind: "section", subprojectId: requested }
      : { kind: "not-found" };
  }

  const defaultId = resolveDefaultSectionId(input.subprojects, input.defaultSubprojectId);
  return defaultId ? { kind: "section", subprojectId: defaultId } : { kind: "all" };
}

/**
 * Sezione predefinita reale (D-21): default_subproject_id se appartiene alle sezioni del progetto, già
 * caricate con il filtro di proprietà, altrimenti la prima per posizione; null se il progetto non ha sezioni.
 * Usata da pagina dei risultati, pagina del progetto e avvio dell'estrazione senza subprojectId.
 */
export function resolveDefaultSectionId(
  subprojects: { id: string; position: number }[],
  defaultSubprojectId: string | null
): string | null {
  if (defaultSubprojectId && subprojects.some((section) => section.id === defaultSubprojectId)) {
    return defaultSubprojectId;
  }

  const [first] = [...subprojects].sort((a, b) => a.position - b.position);
  return first?.id ?? null;
}

/** Parametri della vista: view=all oppure subprojectId, mai entrambi. */
function withView(params: URLSearchParams, target: ResultsTarget): URLSearchParams {
  const next = new URLSearchParams(params);
  next.delete("view");
  next.delete("subprojectId");
  if ("view" in target) {
    next.set("view", "all");
  } else {
    next.set("subprojectId", target.subprojectId);
  }
  return next;
}

export function viewTarget(view: ShownResultsView): ResultsTarget {
  return view.kind === "all" ? { view: "all" } : { subprojectId: view.subprojectId };
}

/** Href della pagina dei risultati con la vista dichiarata e gli altri parametri (filtri, paginazione). */
export function resultsHref(projectId: string, target: ResultsTarget, params = new URLSearchParams()): string {
  return `/projects/${projectId}/results?${withView(params, target).toString()}`;
}

/** Href di export della vista risolta: sezione (se c'è) e filtri, senza page né pageSize. */
export function buildResultsExportHref(
  projectId: string,
  view: ShownResultsView,
  searchParams: SearchParamsSource,
  format: ExportFormat,
  scope: ExportScope
): string {
  const params = toUrlSearchParams(searchParams);
  params.delete("page");
  params.delete("pageSize");
  params.delete("view");
  params.delete("subprojectId");
  if (view.kind === "section") {
    params.set("subprojectId", view.subprojectId);
  }
  params.set("format", format);
  params.set("scope", scope);
  return `/api/projects/${projectId}/export?${params.toString()}`;
}
