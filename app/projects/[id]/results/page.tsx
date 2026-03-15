import Link from "next/link";
import { notFound } from "next/navigation";
import { ResultsTable } from "@/components/results-table";
import { requireAuthenticatedUserFromCookies } from "@/lib/auth/current-user";
import { buildResultsWhere, parseResultsFilters } from "@/lib/modules/results-filters";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

type SearchParams = Record<string, string | string[] | undefined>;

function getValue(searchParams: SearchParams, key: string): string {
  const value = searchParams[key];
  if (Array.isArray(value)) {
    return value[0] ?? "";
  }
  return value ?? "";
}

function checked(searchParams: SearchParams, key: string): boolean {
  const value = getValue(searchParams, key);
  return ["1", "true", "on", "yes"].includes(value.toLowerCase());
}

function toQueryParams(searchParams: SearchParams): URLSearchParams {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(searchParams)) {
    if (!value) continue;
    if (Array.isArray(value)) {
      if (value[0]) params.set(key, value[0]);
      continue;
    }

    params.set(key, value);
  }

  return params;
}

function buildPath(projectId: string, base: URLSearchParams): string {
  const query = base.toString();
  return query ? `/projects/${projectId}/results?${query}` : `/projects/${projectId}/results`;
}

function buildExportLink(
  projectId: string,
  format: "csv" | "xlsx" | "json",
  scope: "approved" | "selected" | "review" | "non-excluded" | "filtered",
  searchParams: SearchParams
): string {
  const params = toQueryParams(searchParams);
  params.set("format", format);
  params.set("scope", scope);

  return `/api/projects/${projectId}/export?${params.toString()}`;
}

export default async function ResultsPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<SearchParams>;
}) {
  const user = await requireAuthenticatedUserFromCookies();
  const [{ id }, resolvedSearchParams] = await Promise.all([params, searchParams]);

  const project = await prisma.project.findFirst({
    where: {
      id,
      owner_user_id: user.id,
    },
    include: {
      subprojects: {
        orderBy: [{ position: "asc" }, { created_at: "asc" }],
        select: {
          id: true,
          name: true,
        },
      },
    },
  });

  if (!project) {
    notFound();
  }

  const defaultSection =
    project.subprojects.find((item) => item.id === project.default_subproject_id) ?? project.subprojects[0] ?? null;

  const viewMode = getValue(resolvedSearchParams, "view").trim().toLowerCase() === "all" ? "all" : "section";
  const requestedSubprojectId = getValue(resolvedSearchParams, "subprojectId").trim();
  const inferredSubprojectId = requestedSubprojectId || defaultSection?.id || "";

  const selectedSubproject =
    viewMode === "all"
      ? null
      : project.subprojects.find((item) => item.id === inferredSubprojectId) ?? (project.subprojects[0] ?? null);

  if (requestedSubprojectId && !project.subprojects.some((item) => item.id === requestedSubprojectId)) {
    notFound();
  }

  const filters = parseResultsFilters(resolvedSearchParams);
  const where = buildResultsWhere(project.id, filters, selectedSubproject?.id ?? null);

  const [rows, filteredCount, projectTotalCount, scopeTotalCount] = await Promise.all([
    prisma.keywordCandidate.findMany({
      where,
      orderBy: [{ score: "desc" }, { keyword: "asc" }],
      take: 1000,
      select: {
        id: true,
        subproject_id: true,
        keyword: true,
        source: true,
        brand_status: true,
        review_status: true,
        selected_for_export: true,
        keyword_type: true,
        search_intent: true,
        avg_monthly_searches: true,
        competition: true,
        score: true,
        subproject: {
          select: {
            name: true,
          },
        },
      },
    }),
    prisma.keywordCandidate.count({ where }),
    prisma.keywordCandidate.count({ where: { project_id: project.id } }),
    prisma.keywordCandidate.count({
      where: selectedSubproject ? { project_id: project.id, subproject_id: selectedSubproject.id } : { project_id: project.id },
    }),
  ]);

  const activeViewParams = toQueryParams(resolvedSearchParams);
  activeViewParams.set("view", "section");
  if (selectedSubproject?.id) {
    activeViewParams.set("subprojectId", selectedSubproject.id);
  } else if (defaultSection?.id) {
    activeViewParams.set("subprojectId", defaultSection.id);
  }

  const allViewParams = toQueryParams(resolvedSearchParams);
  allViewParams.set("view", "all");
  allViewParams.delete("subprojectId");

  return (
    <div className="space-y-6">
      <section className="card space-y-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <h1 className="text-2xl font-semibold">
            Risultati - {project.name}
            {selectedSubproject ? ` / ${selectedSubproject.name}` : " / Tutte le sezioni"}
          </h1>
          <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row sm:flex-wrap">
            <Link className="btn-secondary w-full text-center sm:w-auto" href={`/projects/${project.id}`}>
              Torna al progetto
            </Link>
            <Link className="btn-secondary w-full text-center sm:w-auto" href={`/projects/${project.id}/settings`}>
              Impostazioni progetto
            </Link>
          </div>
        </div>

        <div className="flex flex-wrap gap-2">
          <Link className={viewMode === "section" ? "btn-primary" : "btn-secondary"} href={buildPath(project.id, activeViewParams)}>
            Sezione attiva
          </Link>
          <Link className={viewMode === "all" ? "btn-primary" : "btn-secondary"} href={buildPath(project.id, allViewParams)}>
            Tutto il progetto
          </Link>
        </div>

        <p className="text-sm text-slate-600">
          Mostrate {filteredCount} keyword su {scopeTotalCount}
          {selectedSubproject ? ` nella sezione ${selectedSubproject.name}.` : " nel progetto."}
          {!selectedSubproject && ` Totale progetto: ${projectTotalCount}.`}
        </p>

        <form method="get" className="grid gap-3 md:grid-cols-4">
          <input type="hidden" name="view" value={viewMode} />

          {viewMode === "section" && (
            <select className="select" name="subprojectId" defaultValue={selectedSubproject?.id ?? ""}>
              {project.subprojects.map((subproject) => (
                <option key={subproject.id} value={subproject.id}>
                  {subproject.name}
                </option>
              ))}
            </select>
          )}

          <input className="input" name="searchText" placeholder="Testo ricerca" defaultValue={getValue(resolvedSearchParams, "searchText")} />
          <input className="input" name="minVolume" type="number" placeholder="Volume minimo" defaultValue={getValue(resolvedSearchParams, "minVolume")} />
          <input className="input" name="maxVolume" type="number" placeholder="Volume massimo" defaultValue={getValue(resolvedSearchParams, "maxVolume")} />

          <select className="select" name="brandStatus" defaultValue={getValue(resolvedSearchParams, "brandStatus")}>
            <option value="">Stato brand</option>
            <option value="allowed">consentito</option>
            <option value="excluded">escluso</option>
            <option value="review">da rivedere</option>
          </select>

          <select className="select" name="reviewStatus" defaultValue={getValue(resolvedSearchParams, "reviewStatus")}>
            <option value="">Stato revisione</option>
            <option value="pending">in attesa</option>
            <option value="approved">approvato</option>
            <option value="rejected">rifiutato</option>
          </select>

          <select className="select" name="searchIntent" defaultValue={getValue(resolvedSearchParams, "searchIntent")}>
            <option value="">Intento di ricerca</option>
            <option value="informational">informativo</option>
            <option value="commercial">commerciale</option>
            <option value="transactional">transazionale</option>
            <option value="navigational">navigazionale</option>
            <option value="mixed">misto</option>
          </select>

          <select className="select" name="keywordType" defaultValue={getValue(resolvedSearchParams, "keywordType")}>
            <option value="">Tipo keyword</option>
            <option value="generic">generica</option>
            <option value="question">domanda</option>
            <option value="comparison">comparazione</option>
            <option value="branded">brand</option>
            <option value="local">locale</option>
            <option value="tool">tool</option>
            <option value="service">servizio</option>
            <option value="product">prodotto</option>
            <option value="content_topic">tema contenuto</option>
          </select>

          <div className="flex flex-wrap items-center gap-x-4 gap-y-2 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm md:col-span-2">
            <label className="flex items-center gap-2">
              <input type="checkbox" name="selectedOnly" defaultChecked={checked(resolvedSearchParams, "selectedOnly")} /> solo selezionate
            </label>
            <label className="flex items-center gap-2">
              <input type="checkbox" name="questionOnly" defaultChecked={checked(resolvedSearchParams, "questionOnly")} /> solo domande
            </label>
            <label className="flex items-center gap-2">
              <input type="checkbox" name="toolIntentOnly" defaultChecked={checked(resolvedSearchParams, "toolIntentOnly")} /> solo intent tool
            </label>
            <label className="flex items-center gap-2">
              <input type="checkbox" name="commercialOnly" defaultChecked={checked(resolvedSearchParams, "commercialOnly")} /> solo commerciali
            </label>
          </div>

          <div className="md:col-span-2">
            <button className="btn-primary w-full sm:w-auto" type="submit">
              Applica filtri
            </button>
          </div>
        </form>
      </section>

      <section className="card space-y-3">
        <h2 className="text-lg font-semibold">Export</h2>
        <div className="flex flex-col gap-2 text-sm sm:flex-row sm:flex-wrap">
          <Link className="btn-secondary w-full text-center sm:w-auto" href={buildExportLink(project.id, "csv", "approved", resolvedSearchParams)}>
            CSV solo approvate
          </Link>
          <Link className="btn-secondary w-full text-center sm:w-auto" href={buildExportLink(project.id, "xlsx", "selected", resolvedSearchParams)}>
            XLSX solo selezionate
          </Link>
          <Link className="btn-secondary w-full text-center sm:w-auto" href={buildExportLink(project.id, "json", "review", resolvedSearchParams)}>
            JSON solo review
          </Link>
          <Link className="btn-secondary w-full text-center sm:w-auto" href={buildExportLink(project.id, "csv", "non-excluded", resolvedSearchParams)}>
            CSV tutte non escluse
          </Link>
          <Link className="btn-secondary w-full text-center sm:w-auto" href={buildExportLink(project.id, "xlsx", "filtered", resolvedSearchParams)}>
            XLSX vista filtrata corrente
          </Link>
        </div>
      </section>

      <section className="card">
        <ResultsTable
          projectId={project.id}
          activeSubprojectId={selectedSubproject?.id ?? null}
          showSubprojectColumn={!selectedSubproject}
          rows={rows.map((row) => ({
            id: row.id,
            subproject_id: row.subproject_id,
            subproject_name: row.subproject.name,
            keyword: row.keyword,
            source: row.source,
            brand_status: row.brand_status,
            review_status: row.review_status,
            selected_for_export: row.selected_for_export,
            keyword_type: row.keyword_type,
            search_intent: row.search_intent,
            avg_monthly_searches: row.avg_monthly_searches,
            competition: row.competition,
            score: row.score,
          }))}
        />
      </section>
    </div>
  );
}

