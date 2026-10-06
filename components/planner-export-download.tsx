"use client";

import { useState } from "react";
import { ApiErrorPayload, buildApiErrorMessage, readJsonSafe } from "@/lib/client/http";

type PlannerExportSummary = {
  canonicals: number;
  parts: number;
  skipped: { keyword: string; reason: string }[];
};

/** Download dei file per Keyword Planner (T-904), primo passo del round-trip dei volumi (D-09). */
export function PlannerExportDownload({ projectId, subprojectId }: { projectId: string; subprojectId: string | null }) {
  const [summary, setSummary] = useState<PlannerExportSummary | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const query = new URLSearchParams(subprojectId ? { sectionId: subprojectId } : {});
  const endpoint = `/api/projects/${projectId}/planner-export`;
  const partHref = (part: number) => `${endpoint}?${new URLSearchParams([...query, ["part", String(part)]])}`;

  async function prepare() {
    setLoading(true);
    setError(null);
    const response = await fetch(`${endpoint}?${query}`);
    const payload = await readJsonSafe<ApiErrorPayload & { data?: PlannerExportSummary }>(response);
    setLoading(false);
    if (!response.ok || !payload?.data) {
      setError(buildApiErrorMessage(response, payload, "Export per Keyword Planner non riuscito."));
      return;
    }
    setSummary(payload.data);
  }

  return (
    <div className="space-y-2 text-sm">
      <p className="text-slate-600">
        1. Scarica i file (una keyword per canonical, al massimo 1000 per file). 2. In Google Ads apri Keyword Planner,
        «Ottieni volume di ricerca e previsioni», e carica un file alla volta. 3. Scarica il risultato e importalo qui.
      </p>
      <button className="btn-secondary w-full sm:w-auto" type="button" onClick={prepare} disabled={loading}>
        {loading ? "Preparazione..." : "Esporta per Keyword Planner"}
      </button>
      {error && (
        <p className="text-red-700" role="alert">
          {error}
        </p>
      )}
      {summary && (
        <div className="space-y-1" role="status">
          <p>
            {summary.canonicals} keyword in {summary.parts} file
            {summary.skipped.length > 0 && `, ${summary.skipped.length} saltate (oltre 80 caratteri o 10 parole, o con un prefisso da formula)`}.
          </p>
          <ul className="flex flex-wrap gap-2">
            {Array.from({ length: summary.parts }, (_, index) => (
              <li key={index}>
                <a className="btn-secondary" href={partHref(index + 1)} download>
                  File {index + 1}
                </a>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
