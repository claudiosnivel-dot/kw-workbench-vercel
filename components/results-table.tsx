"use client";

import { useTranslations } from "next-intl";
import { useState } from "react";
import { useRefreshAction } from "@/lib/client/use-refresh-action";
import { normalizeDisplayText } from "@/lib/text/encoding";

type CandidateRow = {
  id: string;
  subproject_id: string;
  subproject_name: string;
  keyword: string;
  source: string;
  brand_status: string;
  review_status: string;
  selected_for_export: boolean;
  keyword_type: string;
  search_intent: string;
  avg_monthly_searches: number | null;
  competition: number | null;
  score: number | null;
};

type ResultsTableProps = {
  projectId: string;
  rows: CandidateRow[];
  /** Righe del set filtrato della vista (tutte le pagine). */
  filteredCount: number;
  /** Filtri della vista, inviati alla PATCH quando la selezione copre l'intero set filtrato. */
  filters: Record<string, string>;
  activeSubprojectId?: string | null;
  showSubprojectColumn?: boolean;
};

/** Selezione legata alle righe ricevute: quando cambiano (pagina, filtri, vista) non vale più. */
type Selection = { rowsKey: string; ids: string[]; allFiltered: boolean };

const ACTIONS = ["approve", "reject", "mark-review", "select", "unselect"] as const;

/** Gruppi di valori della tabella con un'etichetta nel catalogo (results.<gruppo>.<valore>). */
type ValueGroup = "intent" | "type" | "brand" | "review";

function chipTone(type: "default" | "success" | "warning" | "danger"): string {
  if (type === "success") return "border-emerald-400/40 bg-emerald-500/15 text-emerald-200";
  if (type === "warning") return "border-amber-400/40 bg-amber-500/15 text-amber-200";
  if (type === "danger") return "border-rose-400/40 bg-rose-500/15 text-rose-200";
  return "border-slate-500/40 bg-slate-700/25 text-slate-200";
}

function reviewTone(value: string): string {
  if (value === "approved") return chipTone("success");
  if (value === "rejected") return chipTone("danger");
  if (value === "pending") return chipTone("warning");
  return chipTone("default");
}

function brandTone(value: string): string {
  if (value === "excluded") return chipTone("danger");
  if (value === "review") return chipTone("warning");
  return chipTone("success");
}

export function ResultsTable({
  projectId,
  rows,
  filteredCount,
  filters,
  activeSubprojectId = null,
  showSubprojectColumn = false,
}: ResultsTableProps) {
  const t = useTranslations("results");
  const { loading, error, run } = useRefreshAction();
  const rowsKey = [activeSubprojectId ?? "", JSON.stringify(filters), ...rows.map((row) => row.id)].join("|");
  const [selection, setSelection] = useState<Selection>({ rowsKey, ids: [], allFiltered: false });
  const [action, setAction] = useState<(typeof ACTIONS)[number]>("approve");

  const current = selection.rowsKey === rowsKey ? selection : { rowsKey, ids: [], allFiltered: false };
  const selectedIds = current.ids;
  const isAllSelected = rows.length > 0 && selectedIds.length === rows.length;
  const selectedCount = current.allFiltered ? filteredCount : selectedIds.length;

  const select = (ids: string[], allFiltered = false) => setSelection({ rowsKey, ids, allFiltered });

  // Etichetta del valore nella lingua corrente; un valore senza voce nel catalogo resta com'è.
  const valueLabel = (group: ValueGroup, value: string) => {
    const key = `${group}.${value}` as Parameters<typeof t>[0];
    return t.has(key) ? t(key) : value;
  };

  const toggle = (id: string) => {
    select(selectedIds.includes(id) ? selectedIds.filter((item) => item !== id) : [...selectedIds, id]);
  };

  const toggleAll = () => {
    select(isAllSelected ? [] : rows.map((row) => row.id));
  };

  const runBulkAction = async () => {
    if (selectedCount === 0) {
      return;
    }

    const failure = await run(() =>
      fetch(`/api/projects/${projectId}/results`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(
          current.allFiltered
            ? { action, filters, subprojectId: activeSubprojectId }
            : { action, ids: selectedIds, subprojectId: activeSubprojectId }
        ),
      })
    );
    if (failure === null) {
      select([]);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center">
        <select className="select w-full sm:max-w-xs" aria-label={t("table.bulkLabel")} value={action} onChange={(event) => setAction(event.target.value as typeof action)}>
          {ACTIONS.map((item) => (
            <option key={item} value={item}>
              {t(`table.actions.${item}`)}
            </option>
          ))}
        </select>
        <button className="btn-primary w-full sm:w-auto" type="button" onClick={runBulkAction} disabled={loading || selectedCount === 0}>
          {loading ? t("table.applying") : t("table.applyTo", { count: selectedCount })}
        </button>
        <p className="text-xs text-slate-500 sm:ml-auto">{t("table.bulkHint")}</p>
      </div>

      {isAllSelected && filteredCount > rows.length && (
        <div className="flex flex-col gap-2 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm sm:flex-row sm:items-center">
          {current.allFiltered ? (
            <>
              <p>{t("table.allFilteredSelected", { count: filteredCount })}</p>
              <button className="btn-secondary w-full sm:w-auto" type="button" onClick={() => select(selectedIds)}>
                {t("table.onlyThisPage", { count: rows.length })}
              </button>
            </>
          ) : (
            <>
              <p>{t("table.pageSelected", { count: rows.length })}</p>
              <button className="btn-secondary w-full sm:w-auto" type="button" onClick={() => select(selectedIds, true)}>
                {t("table.selectAllFiltered", { count: filteredCount })}
              </button>
            </>
          )}
        </div>
      )}

      {error && <p className="text-sm text-red-700">{error}</p>}

      <div className="table-shell">
        <table className="table-enterprise min-w-[1080px] text-left text-sm">
          <thead>
            <tr>
              <th className="px-3 py-2">
                <input type="checkbox" checked={isAllSelected} onChange={toggleAll} aria-label={t("table.selectAll")} />
              </th>
              {showSubprojectColumn && <th className="px-3 py-2">{t("table.columns.section")}</th>}
              <th className="px-3 py-2">{t("table.columns.keyword")}</th>
              <th className="px-3 py-2">{t("table.columns.source")}</th>
              <th className="hidden px-3 py-2 md:table-cell">{t("table.columns.intent")}</th>
              <th className="hidden px-3 py-2 md:table-cell">{t("table.columns.type")}</th>
              <th className="hidden px-3 py-2 md:table-cell">{t("table.columns.brand")}</th>
              <th className="hidden px-3 py-2 md:table-cell">{t("table.columns.review")}</th>
              <th className="px-3 py-2">{t("table.columns.volume")}</th>
              <th className="hidden px-3 py-2 md:table-cell">{t("table.columns.competition")}</th>
              <th className="px-3 py-2">{t("table.columns.score")}</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => {
              const checked = selectedIds.includes(row.id);
              const displayKeyword = normalizeDisplayText(row.keyword);

              return (
                <tr key={row.id}>
                  <td className="px-3 py-3">
                    <input type="checkbox" checked={checked} onChange={() => toggle(row.id)} aria-label={t("table.selectRow", { keyword: displayKeyword })} />
                  </td>
                  {showSubprojectColumn && (
                    <td className="px-3 py-3">
                      <span className="status-chip">{row.subproject_name}</span>
                    </td>
                  )}
                  <td className="max-w-[20rem] wrap-break-word px-3 py-3 font-medium">{displayKeyword}</td>
                  <td className="px-3 py-3 text-xs">{row.source}</td>
                  <td className="hidden px-3 py-3 md:table-cell">
                    <span className="status-chip">{valueLabel("intent", row.search_intent)}</span>
                  </td>
                  <td className="hidden px-3 py-3 md:table-cell">
                    <span className="status-chip">{valueLabel("type", row.keyword_type)}</span>
                  </td>
                  <td className="hidden px-3 py-3 md:table-cell">
                    <span className={`status-chip ${brandTone(row.brand_status)}`}>{valueLabel("brand", row.brand_status)}</span>
                  </td>
                  <td className="hidden px-3 py-3 md:table-cell">
                    <span className={`status-chip ${reviewTone(row.review_status)}`}>{valueLabel("review", row.review_status)}</span>
                  </td>
                  <td className="px-3 py-3">{row.avg_monthly_searches ?? "-"}</td>
                  <td className="hidden px-3 py-3 md:table-cell">{row.competition ?? "-"}</td>
                  <td className="px-3 py-3 font-medium">{row.score ? row.score.toFixed(1) : "-"}</td>
                </tr>
              );
            })}
            {rows.length === 0 && (
              <tr>
                <td className="px-3 py-6 text-sm text-slate-500" colSpan={showSubprojectColumn ? 11 : 10}>
                  {t("table.empty")}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}


