import Link from "next/link";
import { notFound } from "next/navigation";
import { GoogleSheetsExportButton } from "@/components/google-sheets-export-button";
import { PaginationLinks } from "@/components/pagination-links";
import { PlannerDisabledNotice } from "@/components/planner-disabled-notice";
import { ResultsTable } from "@/components/results-table";
import { requirePageUser } from "@/lib/auth/page-guard";
import { getGoogleSheetsCredentialSnapshot } from "@/lib/integrations/google-sheets";
import { isClassificationSupported } from "@/lib/modules/classification";
import { parseResultsFilters } from "@/lib/modules/results-filters";
import { parsePagingParams, withPaging } from "@/lib/modules/results-paging";
import { loadResultsPage } from "@/lib/modules/results-query";
import type { ExportFormat, ExportScope } from "@/lib/modules/export";
import {
  buildResultsExportHref,
  resolveDefaultSectionId,
  resolveResultsView,
  resultsHref,
  toUrlSearchParams,
  viewTarget,
} from "@/lib/modules/results-view";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

type SearchParams = Record<string, string | string[] | undefined>;

function buildDefaultSheetsFileName(projectName: string, subprojectName?: string): string {
  const date = new Date().toISOString().slice(0, 10);
  const base = subprojectName ? `${projectName} - ${subprojectName}` : projectName;
  return `${base} keyword export ${date}`;
}

export default async function ResultsPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<SearchParams>;
}) {
  const user = await requirePageUser();
  const [{ id }, resolvedSearchParams] = await Promise.all([params, searchParams]);

  const [project, googleSheets] = await Promise.all([
    prisma.project.findFirst({
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
            position: true,
            metrics_provider_override: true,
            language_code_override: true,
          },
        },
      },
    }),
    getGoogleSheetsCredentialSnapshot(user.id),
  ]);

  if (!project) {
    notFound();
  }

  const view = resolveResultsView({
    subprojects: project.subprojects,
    defaultSubprojectId: project.default_subproject_id,
    searchParams: resolvedSearchParams,
  });

  if (view.kind === "not-found") {
    notFound();
  }

  const selectedSubproject =
    view.kind === "section" ? project.subprojects.find((item) => item.id === view.subprojectId) ?? null : null;
  // Destinazione di «Sezione attiva» dalla vista progetto: la sezione predefinita.
  const activeSectionId =
    view.kind === "section" ? view.subprojectId : resolveDefaultSectionId(project.subprojects, project.default_subproject_id);

  const shownSections = selectedSubproject ? [selectedSubproject] : project.subprojects;

  // Avviso di T-304 se una delle sezioni mostrate usa il provider Keyword Planner spento.
  const plannerDisabled = shownSections.some(
    (section) => (section.metrics_provider_override ?? project.metrics_provider) === "GOOGLE_KEYWORD_PLANNER"
  );

  // Nota di T-704 per ogni lingua effettiva delle sezioni mostrate senza lessico di classificazione.
  const unclassifiedLanguages = Array.from(
    new Set(shownSections.map((section) => section.language_code_override ?? project.language_code))
  ).filter((languageCode) => !isClassificationSupported(languageCode));

  const filters = parseResultsFilters(resolvedSearchParams);
  const paging = parsePagingParams(resolvedSearchParams);
  const pageSize = paging.pageSize;
  const { rows, filteredCount, scopeTotalCount, page, totalPages, pageStart, pageEnd } = await loadResultsPage({
    projectId: project.id,
    subprojectId: selectedSubproject?.id ?? null,
    filters,
    page: paging.page,
    pageSize,
  });

  const currentParams = toUrlSearchParams(resolvedSearchParams);
  // Valori correnti dei filtri per il form (primo valore dei parametri ripetuti).
  const filterValue = (key: string) => currentParams.get(key) ?? "";
  const filterChecked = (key: string) => ["1", "true", "on", "yes"].includes(filterValue(key).toLowerCase());
  const target = viewTarget(view);
  const firstPage = withPaging(currentParams, { page: 1, pageSize });

  const sectionViewHref = activeSectionId ? resultsHref(project.id, { subprojectId: activeSectionId }, firstPage) : null;
  const allViewHref = resultsHref(project.id, { view: "all" }, firstPage);
  const prevPageHref = resultsHref(project.id, target, withPaging(currentParams, { page: Math.max(1, page - 1), pageSize }));
  const nextPageHref = resultsHref(project.id, target, withPaging(currentParams, { page: Math.min(totalPages, page + 1), pageSize }));
  // Filtri della vista per l'azione massiva sull'intero set filtrato (T-803): la sezione viaggia a parte.
  const tableFilters = Object.fromEntries(
    [...currentParams].filter(([key]) => !["page", "pageSize", "view", "subprojectId"].includes(key))
  );
  const exportHref = (format: ExportFormat, scope: ExportScope) =>
    buildResultsExportHref(project.id, view, resolvedSearchParams, format, scope);

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
          {sectionViewHref && (
            <Link className={view.kind === "section" ? "btn-primary" : "btn-secondary"} href={sectionViewHref}>
              Sezione attiva
            </Link>
          )}
          <Link className={view.kind === "all" ? "btn-primary" : "btn-secondary"} href={allViewHref}>
            Tutto il progetto
          </Link>
        </div>

        {plannerDisabled && <PlannerDisabledNotice />}
        {unclassifiedLanguages.map((languageCode) => (
          <p key={languageCode} className="text-sm text-slate-600">
            Classificazione automatica non disponibile per la lingua {languageCode}
          </p>
        ))}

        <p className="text-sm text-slate-600">
          Mostrate {filteredCount} keyword su {scopeTotalCount}
          {selectedSubproject ? ` nella sezione ${selectedSubproject.name}.` : " nel progetto."}
          {!selectedSubproject && ` Totale progetto: ${scopeTotalCount}.`}
        </p>

        <form method="get" className="grid gap-3 md:grid-cols-4">
          <input type="hidden" name="view" value={view.kind} />
          <input type="hidden" name="page" value="1" />
          <input type="hidden" name="pageSize" value={String(pageSize)} />

          {view.kind === "section" && (
            <select className="select" name="subprojectId" defaultValue={selectedSubproject?.id ?? ""}>
              {project.subprojects.map((subproject) => (
                <option key={subproject.id} value={subproject.id}>
                  {subproject.name}
                </option>
              ))}
            </select>
          )}

          <input className="input" name="searchText" placeholder="Testo ricerca" defaultValue={filterValue("searchText")} />
          <input className="input" name="minVolume" type="number" placeholder="Volume minimo" defaultValue={filterValue("minVolume")} />
          <input className="input" name="maxVolume" type="number" placeholder="Volume massimo" defaultValue={filterValue("maxVolume")} />

          <select className="select" name="brandStatus" defaultValue={filterValue("brandStatus")}>
            <option value="">Stato brand</option>
            <option value="allowed">consentito</option>
            <option value="excluded">escluso</option>
            <option value="review">da rivedere</option>
          </select>

          <select className="select" name="reviewStatus" defaultValue={filterValue("reviewStatus")}>
            <option value="">Stato revisione</option>
            <option value="pending">in attesa</option>
            <option value="approved">approvato</option>
            <option value="rejected">rifiutato</option>
          </select>

          <select className="select" name="searchIntent" defaultValue={filterValue("searchIntent")}>
            <option value="">Intento di ricerca</option>
            <option value="informational">informativo</option>
            <option value="commercial">commerciale</option>
            <option value="transactional">transazionale</option>
            <option value="navigational">navigazionale</option>
            <option value="mixed">misto</option>
          </select>

          <select className="select" name="keywordType" defaultValue={filterValue("keywordType")}>
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
              <input type="checkbox" name="selectedOnly" defaultChecked={filterChecked("selectedOnly")} /> solo selezionate
            </label>
            <label className="flex items-center gap-2">
              <input type="checkbox" name="questionOnly" defaultChecked={filterChecked("questionOnly")} /> solo domande
            </label>
            <label className="flex items-center gap-2">
              <input type="checkbox" name="toolIntentOnly" defaultChecked={filterChecked("toolIntentOnly")} /> solo intent tool
            </label>
            <label className="flex items-center gap-2">
              <input type="checkbox" name="commercialOnly" defaultChecked={filterChecked("commercialOnly")} /> solo commerciali
            </label>
          </div>

          <div className="md:col-span-2">
            <button className="btn-primary w-full sm:w-auto" type="submit">
              Applica filtri
            </button>
          </div>
        </form>

        <div className="flex flex-col gap-3 rounded-xl border border-[var(--surface-border)] bg-[var(--surface-muted)] px-3 py-3 text-sm sm:flex-row sm:items-center sm:justify-between">
          <p className="text-slate-600">
            Riga {pageStart}-{pageEnd} di {filteredCount} (pagina {page}/{totalPages})
          </p>
          <PaginationLinks
            previousHref={page > 1 ? prevPageHref : null}
            nextHref={page < totalPages ? nextPageHref : null}
          />
        </div>
      </section>

      <section className="card space-y-3">
        <h2 className="text-lg font-semibold">Export</h2>
        <p className="text-sm text-slate-600">Gli export usano la sezione e i filtri della vista corrente</p>
        <div className="flex flex-col gap-2 text-sm sm:flex-row sm:flex-wrap">
          <GoogleSheetsExportButton
            projectId={project.id}
            subprojectId={selectedSubproject?.id ?? null}
            connected={googleSheets.connected}
            defaultFileName={buildDefaultSheetsFileName(project.name, selectedSubproject?.name)}
            filters={resolvedSearchParams}
          />
          <Link className="btn-secondary w-full text-center sm:w-auto" href={exportHref("csv", "approved")}>
            CSV solo approvate
          </Link>
          <Link className="btn-secondary w-full text-center sm:w-auto" href={exportHref("xlsx", "selected")}>
            XLSX solo selezionate
          </Link>
          <Link className="btn-secondary w-full text-center sm:w-auto" href={exportHref("json", "review")}>
            JSON solo review
          </Link>
          <Link className="btn-secondary w-full text-center sm:w-auto" href={exportHref("csv", "non-excluded")}>
            CSV tutte non escluse
          </Link>
          <Link className="btn-secondary w-full text-center sm:w-auto" href={exportHref("xlsx", "filtered")}>
            XLSX vista filtrata corrente
          </Link>
        </div>
      </section>

      <section className="card">
        <ResultsTable
          projectId={project.id}
          activeSubprojectId={selectedSubproject?.id ?? null}
          showSubprojectColumn={!selectedSubproject}
          filteredCount={filteredCount}
          filters={tableFilters}
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
