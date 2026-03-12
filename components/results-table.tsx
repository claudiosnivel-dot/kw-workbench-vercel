"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { ApiErrorPayload, buildApiErrorMessage, readJsonSafe } from "@/lib/client/http";
import { normalizeDisplayText } from "@/lib/text/encoding";

type CandidateRow = {
  id: string;
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
};

const ACTIONS = [
  { value: "approve", label: "Approva" },
  { value: "reject", label: "Rifiuta" },
  { value: "mark-review", label: "Segna review" },
  { value: "select", label: "Seleziona per export" },
  { value: "unselect", label: "Deseleziona per export" },
] as const;

export function ResultsTable({ projectId, rows }: ResultsTableProps) {
  const router = useRouter();
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [action, setAction] = useState<(typeof ACTIONS)[number]["value"]>("approve");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const allIds = useMemo(() => rows.map((row) => row.id), [rows]);
  const isAllSelected = rows.length > 0 && selectedIds.length === rows.length;

  const toggle = (id: string) => {
    setSelectedIds((current) => (current.includes(id) ? current.filter((item) => item !== id) : [...current, id]));
  };

  const toggleAll = () => {
    setSelectedIds(isAllSelected ? [] : allIds);
  };

  const runBulkAction = async () => {
    if (selectedIds.length === 0) {
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const response = await fetch(`/api/projects/${projectId}/results`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, ids: selectedIds }),
      });

      const payload = await readJsonSafe<ApiErrorPayload>(response);
      if (!response.ok) {
        throw new Error(buildApiErrorMessage(response, payload, "Azione massiva non riuscita"));
      }

      setSelectedIds([]);
      router.refresh();
    } catch (bulkError) {
      setError(bulkError instanceof Error ? bulkError.message : "Errore imprevisto");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <select className="select max-w-xs" value={action} onChange={(event) => setAction(event.target.value as typeof action)}>
          {ACTIONS.map((item) => (
            <option key={item.value} value={item.value}>
              {item.label}
            </option>
          ))}
        </select>
        <button className="btn-primary" type="button" onClick={runBulkAction} disabled={loading || selectedIds.length === 0}>
          {loading ? "Applicazione..." : `Applica a ${selectedIds.length} selezionate`}
        </button>
        <p className="text-xs text-slate-500">Azioni massive disponibili: approva/rifiuta/review/seleziona/deseleziona.</p>
      </div>

      {error && <p className="text-sm text-red-700">{error}</p>}

      <div className="overflow-x-auto rounded-xl ring-1 ring-slate-200">
        <table className="min-w-full bg-white text-left text-sm">
          <thead className="text-xs uppercase text-slate-500">
            <tr>
              <th className="px-3 py-2">
                <input type="checkbox" checked={isAllSelected} onChange={toggleAll} aria-label="Seleziona tutto" />
              </th>
              <th className="px-3 py-2">Keyword</th>
              <th className="px-3 py-2">Sorgente</th>
              <th className="px-3 py-2">Intento</th>
              <th className="px-3 py-2">Tipo</th>
              <th className="px-3 py-2">Brand</th>
              <th className="px-3 py-2">Review</th>
              <th className="px-3 py-2">Volume</th>
              <th className="px-3 py-2">Competizione</th>
              <th className="px-3 py-2">Score</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => {
              const checked = selectedIds.includes(row.id);
              const displayKeyword = normalizeDisplayText(row.keyword);

              return (
                <tr key={row.id} className="border-t border-slate-200">
                  <td className="px-3 py-2">
                    <input type="checkbox" checked={checked} onChange={() => toggle(row.id)} aria-label={`Seleziona ${displayKeyword}`} />
                  </td>
                  <td className="px-3 py-2 font-medium">{displayKeyword}</td>
                  <td className="px-3 py-2 text-xs">{row.source}</td>
                  <td className="px-3 py-2">{row.search_intent}</td>
                  <td className="px-3 py-2">{row.keyword_type}</td>
                  <td className="px-3 py-2">{row.brand_status}</td>
                  <td className="px-3 py-2">{row.review_status}</td>
                  <td className="px-3 py-2">{row.avg_monthly_searches ?? "-"}</td>
                  <td className="px-3 py-2">{row.competition ?? "-"}</td>
                  <td className="px-3 py-2">{row.score ? row.score.toFixed(1) : "-"}</td>
                </tr>
              );
            })}
            {rows.length === 0 && (
              <tr>
                <td className="px-3 py-6 text-sm text-slate-500" colSpan={10}>
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
