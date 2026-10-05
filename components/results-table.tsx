"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ApiErrorPayload, buildApiErrorMessage, readJsonSafe } from "@/lib/client/http";
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

const ACTIONS = [
  { value: "approve", label: "Approva" },
  { value: "reject", label: "Rifiuta" },
  { value: "mark-review", label: "Segna review" },
  { value: "select", label: "Seleziona per export" },
  { value: "unselect", label: "Deseleziona per export" },
] as const;

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
  const router = useRouter();
  const rowsKey = [activeSubprojectId ?? "", JSON.stringify(filters), ...rows.map((row) => row.id)].join("|");
  const [selection, setSelection] = useState<Selection>({ rowsKey, ids: [], allFiltered: false });
  const [action, setAction] = useState<(typeof ACTIONS)[number]["value"]>("approve");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const current = selection.rowsKey === rowsKey ? selection : { rowsKey, ids: [], allFiltered: false };
  const selectedIds = current.ids;
  const isAllSelected = rows.length > 0 && selectedIds.length === rows.length;
  const selectedCount = current.allFiltered ? filteredCount : selectedIds.length;

  const select = (ids: string[], allFiltered = false) => setSelection({ rowsKey, ids, allFiltered });

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

    setLoading(true);
    setError(null);

    try {
      const response = await fetch(`/api/projects/${projectId}/results`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(
          current.allFiltered
            ? { action, filters, subprojectId: activeSubprojectId }
            : { action, ids: selectedIds, subprojectId: activeSubprojectId }
        ),
      });

      const payload = await readJsonSafe<ApiErrorPayload>(response);
      if (!response.ok) {
        throw new Error(buildApiErrorMessage(response, payload, "Azione massiva non riuscita"));
      }

      select([]);
      router.refresh();
    } catch (bulkError) {
      setError(bulkError instanceof Error ? bulkError.message : "Errore imprevisto");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center">
        <select className="select w-full sm:max-w-xs" value={action} onChange={(event) => setAction(event.target.value as typeof action)}>
          {ACTIONS.map((item) => (
            <option key={item.value} value={item.value}>
              {item.label}
            </option>
          ))}
        </select>
        <button className="btn-primary w-full sm:w-auto" type="button" onClick={runBulkAction} disabled={loading || selectedCount === 0}>
          {loading ? "Applicazione..." : `Applica a ${selectedCount} selezionate`}
        </button>
        <p className="text-xs text-slate-500 sm:ml-auto">Azioni massive: approva, rifiuta, review, seleziona, deseleziona.</p>
      </div>

      {isAllSelected && filteredCount > rows.length && (
        <div className="flex flex-col gap-2 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm sm:flex-row sm:items-center">
          {current.allFiltered ? (
            <>
              <p>Selezionate tutte le {filteredCount} keyword filtrate.</p>
              <button className="btn-secondary w-full sm:w-auto" type="button" onClick={() => select(selectedIds)}>
                Solo le {rows.length} di questa pagina
              </button>
            </>
          ) : (
            <>
              <p>Selezionate le {rows.length} keyword di questa pagina.</p>
              <button className="btn-secondary w-full sm:w-auto" type="button" onClick={() => select(selectedIds, true)}>
                Seleziona tutte le {filteredCount} keyword filtrate
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
                <input type="checkbox" checked={isAllSelected} onChange={toggleAll} aria-label="Seleziona tutto" />
              </th>
              {showSubprojectColumn && <th className="px-3 py-2">Sezione</th>}
              <th className="px-3 py-2">Keyword</th>
              <th className="px-3 py-2">Sorgente</th>
              <th className="hidden px-3 py-2 md:table-cell">Intento</th>
              <th className="hidden px-3 py-2 md:table-cell">Tipo</th>
              <th className="hidden px-3 py-2 md:table-cell">Brand</th>
              <th className="hidden px-3 py-2 md:table-cell">Review</th>
              <th className="px-3 py-2">Volume</th>
              <th className="hidden px-3 py-2 md:table-cell">Competizione</th>
              <th className="px-3 py-2">Score</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => {
              const checked = selectedIds.includes(row.id);
              const displayKeyword = normalizeDisplayText(row.keyword);

              return (
                <tr key={row.id}>
                  <td className="px-3 py-3">
                    <input type="checkbox" checked={checked} onChange={() => toggle(row.id)} aria-label={`Seleziona ${displayKeyword}`} />
                  </td>
                  {showSubprojectColumn && (
                    <td className="px-3 py-3">
                      <span className="status-chip">{row.subproject_name}</span>
                    </td>
                  )}
                  <td className="max-w-[20rem] wrap-break-word px-3 py-3 font-medium">{displayKeyword}</td>
                  <td className="px-3 py-3 text-xs">{row.source}</td>
                  <td className="hidden px-3 py-3 md:table-cell">
                    <span className="status-chip">{row.search_intent}</span>
                  </td>
                  <td className="hidden px-3 py-3 md:table-cell">
                    <span className="status-chip">{row.keyword_type}</span>
                  </td>
                  <td className="hidden px-3 py-3 md:table-cell">
                    <span className={`status-chip ${brandTone(row.brand_status)}`}>{row.brand_status}</span>
                  </td>
                  <td className="hidden px-3 py-3 md:table-cell">
                    <span className={`status-chip ${reviewTone(row.review_status)}`}>{row.review_status}</span>
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
                  Nessuna keyword candidata per questi filtri.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}


