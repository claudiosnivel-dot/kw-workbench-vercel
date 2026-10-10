import Link from "next/link";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { GoogleSheetsExportButton } from "@/components/google-sheets-export-button";
import { PaginationLinks } from "@/components/pagination-links";
import { PlannerExportDownload } from "@/components/planner-export-download";
import { PlannerImportUpload } from "@/components/planner-import-upload";
import { ResultsTable } from "@/components/results-table";
import { requirePageUser } from "@/lib/auth/page-guard";
import { getGoogleSheetsCredentialSnapshot } from "@/lib/integrations/google-sheets";
import { isClassificationSupported } from "@/lib/modules/classification";
import { type ProjectPageProps, requireProjectPage } from "@/lib/modules/project-pages";
import { parseResultsFilters } from "@/lib/modules/results-filters";
import { parsePagingParams, withPaging } from "@/lib/modules/results-paging";
import { loadResultsPage } from "@/lib/modules/results-query";
import type { ExportFormat, ExportScope } from "@/lib/modules/export-types";
import {
  buildResultsExportHref,
  resolveDefaultSectionId,
  resolveResultsView,
  resultsHref,
  toUrlSearchParams,
  viewTarget,
} from "@/lib/modules/results-view";

export const dynamic = "force-dynamic";

// Filtri a scelta della vista: nome del parametro, valori ammessi e gruppo delle etichette nel catalogo (T-1302).
const FILTER_SELECTS = [
  { name: "brandStatus", labels: "brand", values: ["allowed", "excluded", "review"] },
  { name: "reviewStatus", labels: "review", values: ["pending", "approved", "rejected"] },
  { name: "searchIntent", labels: "intent", values: ["informational", "commercial", "transactional", "navigational", "mixed"] },
  {
    name: "keywordType",
    labels: "type",
    values: ["generic", "question", "comparison", "branded", "local", "tool", "service", "product", "content_topic"],
  },
] as const;

const FILTER_CHECKBOXES = ["selectedOnly", "questionOnly", "toolIntentOnly", "commercialOnly"] as const;

const EXPORT_LINKS = [
  { label: "csvApproved", format: "csv", scope: "approved" },
  { label: "xlsxSelected", format: "xlsx", scope: "selected" },
  { label: "jsonReview", format: "json", scope: "review" },
  { label: "csvNonExcluded", format: "csv", scope: "non-excluded" },
  { label: "xlsxFiltered", format: "xlsx", scope: "filtered" },
] as const satisfies ReadonlyArray<{ label: string; format: ExportFormat; scope: ExportScope }>;

function buildDefaultSheetsFileName(projectName: string, subprojectName?: string): string {
  const date = new Date().toISOString().slice(0, 10);
  const base = subprojectName ? `${projectName} - ${subprojectName}` : projectName;
  return `${base} keyword export ${date}`;
}

export default async function ResultsPage({ params, searchParams }: ProjectPageProps) {
  const user = await requirePageUser();
  const [{ id }, resolvedSearchParams] = await Promise.all([params, searchParams]);

  const [project, googleSheets] = await Promise.all([
    requireProjectPage(user.id, id, {
      subprojects: {
        orderBy: [{ position: "asc" }, { created_at: "asc" }],
        select: { id: true, name: true, position: true, metrics_provider_override: true, language_code_override: true },
      },
    }),
    getGoogleSheetsCredentialSnapshot(user.id),
  ]);

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
  const t = await getTranslations();

  return (
    <div className="space-y-6">
      <section className="card space-y-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <h1 className="text-2xl font-semibold">
            {selectedSubproject
              ? t("results.titleSection", { project: project.name, section: selectedSubproject.name })
              : t("results.titleAll", { project: project.name })}
          </h1>
          <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row sm:flex-wrap">
            <Link className="btn-secondary w-full text-center sm:w-auto" href={`/projects/${project.id}`}>
              {t("projects.links.backToProject")}
            </Link>
            <Link className="btn-secondary w-full text-center sm:w-auto" href={`/projects/${project.id}/settings`}>
              {t("projects.links.settings")}
            </Link>
          </div>
        </div>

        <div className="flex flex-wrap gap-2">
          {sectionViewHref && (
            <Link className={view.kind === "section" ? "btn-primary" : "btn-secondary"} href={sectionViewHref}>
              {t("results.activeSection")}
            </Link>
          )}
          <Link className={view.kind === "all" ? "btn-primary" : "btn-secondary"} href={allViewHref}>
            {t("results.wholeProject")}
          </Link>
        </div>

        {unclassifiedLanguages.map((languageCode) => (
          <p key={languageCode} className="text-sm text-slate-600">
            {t("results.noClassification", { language: languageCode })}
          </p>
        ))}

        <p className="text-sm text-slate-600">
          {selectedSubproject
            ? t("results.shownSection", { filtered: filteredCount, total: scopeTotalCount, section: selectedSubproject.name })
            : t("results.shownProject", { filtered: filteredCount, total: scopeTotalCount })}
        </p>

        <form method="get" className="grid gap-3 md:grid-cols-4">
          <input type="hidden" name="view" value={view.kind} />
          <input type="hidden" name="page" value="1" />
          <input type="hidden" name="pageSize" value={String(pageSize)} />

          {view.kind === "section" && (
            <select className="select" name="subprojectId" aria-label={t("results.filters.section")} defaultValue={selectedSubproject?.id ?? ""}>
              {project.subprojects.map((subproject) => (
                <option key={subproject.id} value={subproject.id}>
                  {subproject.name}
                </option>
              ))}
            </select>
          )}

          <input
            className="input"
            name="searchText"
            placeholder={t("results.filters.searchText")}
            defaultValue={filterValue("searchText")}
          />
          <input
            className="input"
            name="minVolume"
            type="number"
            placeholder={t("results.filters.minVolume")}
            defaultValue={filterValue("minVolume")}
          />
          <input
            className="input"
            name="maxVolume"
            type="number"
            placeholder={t("results.filters.maxVolume")}
            defaultValue={filterValue("maxVolume")}
          />

          {FILTER_SELECTS.map((select) => (
            <select
              key={select.name}
              className="select"
              name={select.name}
              aria-label={t(`results.filters.${select.name}`)}
              defaultValue={filterValue(select.name)}
            >
              <option value="">{t(`results.filters.${select.name}`)}</option>
              {select.values.map((value) => (
                <option key={value} value={value}>
                  {t(`results.${select.labels}.${value}` as Parameters<typeof t>[0])}
                </option>
              ))}
            </select>
          ))}

          <div className="flex flex-wrap items-center gap-x-4 gap-y-2 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm md:col-span-2">
            {FILTER_CHECKBOXES.map((name) => (
              <label key={name} className="flex items-center gap-2">
                <input type="checkbox" name={name} defaultChecked={filterChecked(name)} /> {t(`results.filters.${name}`)}
              </label>
            ))}
          </div>

          <div className="md:col-span-2">
            <button className="btn-primary w-full sm:w-auto" type="submit">
              {t("results.filters.apply")}
            </button>
          </div>
        </form>

        <div className="flex flex-col gap-3 rounded-xl border border-[var(--surface-border)] bg-[var(--surface-muted)] px-3 py-3 text-sm sm:flex-row sm:items-center sm:justify-between">
          <p className="text-slate-600">
            {t("results.rows", { start: pageStart, end: pageEnd, filtered: filteredCount, page, totalPages })}
          </p>
          <PaginationLinks
            previousHref={page > 1 ? prevPageHref : null}
            nextHref={page < totalPages ? nextPageHref : null}
          />
        </div>
      </section>

      <section className="card space-y-3">
        <h2 className="text-lg font-semibold">{t("export.title")}</h2>
        <p className="text-sm text-slate-600">{t("export.hint")}</p>
        <div className="flex flex-col gap-2 text-sm sm:flex-row sm:flex-wrap">
          <GoogleSheetsExportButton
            projectId={project.id}
            subprojectId={selectedSubproject?.id ?? null}
            connected={googleSheets.connected}
            defaultFileName={buildDefaultSheetsFileName(project.name, selectedSubproject?.name)}
            filters={resolvedSearchParams}
          />
          {EXPORT_LINKS.map((link) => (
            <Link key={link.label} className="btn-secondary w-full text-center sm:w-auto" href={exportHref(link.format, link.scope)}>
              {t(`export.links.${link.label}`)}
            </Link>
          ))}
          <Link className="btn-secondary w-full text-center sm:w-auto" href={`/projects/${project.id}/strategy`}>
            {t("strategy.ui.title")}
          </Link>
        </div>
      </section>

      <section className="card space-y-3">
        <h2 className="text-lg font-semibold">{t("export.planner.title")}</h2>
        <div className="grid gap-4 md:grid-cols-2">
          <PlannerExportDownload projectId={project.id} subprojectId={selectedSubproject?.id ?? null} />
          <PlannerImportUpload projectId={project.id} subprojectId={selectedSubproject?.id ?? null} />
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
