"use client";

import Link from "next/link";
import { useTranslations } from "next-intl";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useId, useState } from "react";
import { ClassificationSelect } from "@/components/classification-select";
import {
  KEYWORD_CHIPS,
  type KeywordChip,
  KEYWORD_SORTS,
  type KeywordSort,
  OPTIONAL_KEYWORD_COLUMNS,
  type OptionalKeywordColumn,
  VIEW_FILTER_PARAMS,
} from "@/lib/modules/keywords-options";
import { EXTRACTION_BLOCKED_PARAM } from "@/lib/modules/next-step";

// Campi del pannello Filtri: il resto della vista (chip, cerca, ordinamento) viaggia nei campi nascosti.
const PANEL_FIELDS = ["minVolume", "maxVolume", "searchIntent", "keywordType"];

type KeywordToolbarProps = {
  chipCounts: Record<"all" | KeywordChip, number>;
  sort: KeywordSort;
  columns: Set<OptionalKeywordColumn>;
  onColumnChange: (column: OptionalKeywordColumn, shown: boolean) => void;
};

/**
 * Parametri correnti senza le pagine dei due elenchi (cambiare la vista riparte dalla prima pagina) e senza l'avviso di
 * una ricerca non partita, che vale solo all'arrivo sulla pagina.
 */
function useViewParams(): URLSearchParams {
  const params = new URLSearchParams(useSearchParams().toString());
  params.delete("page");
  params.delete("discardedPage");
  params.delete(EXTRACTION_BLOCKED_PARAM);
  return params;
}

function hrefWith(pathname: string, params: URLSearchParams, changes: Record<string, string | null>): string {
  const next = new URLSearchParams(params);
  for (const [key, value] of Object.entries(changes)) {
    if (value) next.set(key, value);
    else next.delete(key);
  }
  const query = next.toString();
  return query ? `${pathname}?${query}` : pathname;
}

/** Campi nascosti con i parametri della vista che il modulo non modifica. */
function HiddenParams({ params, except }: { params: URLSearchParams; except: string[] }) {
  return (
    <>
      {[...params].filter(([key]) => !except.includes(key)).map(([key, value]) => (
        <input key={key} type="hidden" name={key} value={value} />
      ))}
    </>
  );
}

/**
 * Strumenti della pagina delle keyword (T-2403): chip di filtro rapido con il conteggio (solo se maggiore di 0,
 * scorrevoli sotto i 640 px), Cerca, il pannello Filtri chiuso (ricerche minime e massime, intento, tipo), Ordina e
 * Colonne (scelta salvata nel browser). Chip, ricerca, filtri e ordinamento stanno nell'indirizzo della pagina.
 */
export function KeywordToolbar({ chipCounts, sort, columns, onColumnChange }: KeywordToolbarProps) {
  const t = useTranslations("keywords");
  const pathname = usePathname();
  const router = useRouter();
  const params = useViewParams();
  const panelId = useId();
  const searchId = useId();
  const sortId = useId();
  const activeChip = params.get("chip");
  const panelActive = PANEL_FIELDS.some((field) => params.get(field));
  const [panelOpen, setPanelOpen] = useState(false);
  const chips: ("all" | KeywordChip)[] = ["all", ...KEYWORD_CHIPS];
  const anyFilter = VIEW_FILTER_PARAMS.some((key) => params.get(key));

  return (
    <div className="space-y-3">
      <nav aria-label={t("chips.label")} className="keyword-chips">
        {chips
          .filter((chip) => chipCounts[chip] > 0)
          .map((chip) => {
            const active = chip === "all" ? !activeChip : activeChip === chip;
            return (
              <Link
                key={chip}
                href={hrefWith(pathname, params, { chip: chip === "all" ? null : chip })}
                aria-current={active ? "true" : undefined}
                className={`keyword-chip ${active ? "is-active" : ""}`}
              >
                {t(`chips.${chip}`)} <span className="keyword-chip-count">{chipCounts[chip]}</span>
              </Link>
            );
          })}
      </nav>

      <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center">
        <form method="get" action={pathname} role="search" className="flex min-w-0 flex-1 gap-2">
          <HiddenParams params={params} except={["searchText"]} />
          <label className="sr-only" htmlFor={searchId}>
            {t("search.label")}
          </label>
          <input
            id={searchId}
            className="input min-w-0 flex-1"
            type="search"
            name="searchText"
            defaultValue={params.get("searchText") ?? ""}
            placeholder={t("search.placeholder")}
          />
          <button type="submit" className="btn-secondary">
            {t("search.submit")}
          </button>
        </form>

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            className={`btn-secondary ${panelActive ? "is-active" : ""}`}
            aria-expanded={panelOpen}
            aria-controls={panelOpen ? panelId : undefined}
            onClick={() => setPanelOpen((open) => !open)}
          >
            {t("filters.toggle")}
          </button>

          <label className="sr-only" htmlFor={sortId}>
            {t("sort.label")}
          </label>
          <select
            id={sortId}
            className="select is-inline"
            value={sort}
            onChange={(event) => router.replace(hrefWith(pathname, params, { sort: event.target.value === "promising" ? null : event.target.value }))}
          >
            {KEYWORD_SORTS.map((option) => (
              <option key={option} value={option}>
                {t("sort.label")}: {t(`sort.${option}`)}
              </option>
            ))}
          </select>

          <details className="keyword-columns">
            <summary className="btn-secondary">{t("columns.toggle")}</summary>
            <fieldset className="keyword-columns-panel">
              <legend className="sr-only">{t("columns.toggle")}</legend>
              {OPTIONAL_KEYWORD_COLUMNS.map((column) => (
                <label key={column} className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={columns.has(column)}
                    onChange={(event) => onColumnChange(column, event.target.checked)}
                  />
                  {t(`columns.${column}`)}
                </label>
              ))}
            </fieldset>
          </details>
        </div>
      </div>

      {panelOpen && (
        <form id={panelId} method="get" action={pathname} className="keyword-filters-panel">
          <HiddenParams params={params} except={PANEL_FIELDS} />
          <label className="block">
            <span className="label">{t("filters.minVolume")}</span>
            <input className="input" type="number" min={0} name="minVolume" defaultValue={params.get("minVolume") ?? ""} />
          </label>
          <label className="block">
            <span className="label">{t("filters.maxVolume")}</span>
            <input className="input" type="number" min={0} name="maxVolume" defaultValue={params.get("maxVolume") ?? ""} />
          </label>
          <ClassificationSelect
            kind="intent"
            label={t("filters.intent")}
            anyLabel={t("filters.any")}
            name="searchIntent"
            defaultValue={params.get("searchIntent") ?? ""}
          />
          <ClassificationSelect
            kind="type"
            label={t("filters.type")}
            anyLabel={t("filters.any")}
            name="keywordType"
            defaultValue={params.get("keywordType") ?? ""}
          />
          <div className="flex flex-wrap items-end gap-2 sm:col-span-2">
            <button type="submit" className="btn-secondary">
              {t("filters.apply")}
            </button>
            {anyFilter && (
              <Link className="btn-secondary" href={pathname}>
                {t("filters.reset")}
              </Link>
            )}
          </div>
        </form>
      )}
    </div>
  );
}
