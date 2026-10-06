"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import { ApiErrorPayload, buildApiErrorMessage, readJsonSafe } from "@/lib/client/http";
import { PLANNER_IMPORT_EXTENSIONS, PLANNER_IMPORT_MAX_BYTES } from "@/lib/modules/planner/import-limits";

type PlannerImportSummary = {
  matched: number;
  unmatched: number;
  updated: number;
  rangeRows: number;
  /** Righe senza volume («--» o vuoto). */
  withoutVolume: number;
  /** Righe scartate dal parser: senza keyword (riepiloghi per segmento) o con valori non leggibili. */
  skippedRows: number;
};

const MAX_MEGABYTES = PLANNER_IMPORT_MAX_BYTES / (1024 * 1024);

/** Upload del file scaricato da Keyword Planner (T-910): strada principale per i volumi dei clienti (D-09). */
export function PlannerImportUpload({ projectId, subprojectId }: { projectId: string; subprojectId: string | null }) {
  const router = useRouter();
  const [file, setFile] = useState<File | null>(null);
  const [summary, setSummary] = useState<PlannerImportSummary | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!file) {
      return;
    }
    if (file.size > PLANNER_IMPORT_MAX_BYTES) {
      setError(`File troppo grande: il massimo è ${MAX_MEGABYTES} MB.`);
      return;
    }
    const body = new FormData();
    body.set("file", file);
    if (subprojectId) {
      body.set("sectionId", subprojectId);
    }
    setLoading(true);
    setError(null);
    const response = await fetch(`/api/projects/${projectId}/planner-import`, { method: "POST", body });
    const payload = await readJsonSafe<ApiErrorPayload & { data?: PlannerImportSummary }>(response);
    setLoading(false);
    if (!response.ok || !payload?.data) {
      setError(buildApiErrorMessage(response, payload, "Import dei volumi non riuscito."));
      return;
    }
    setSummary(payload.data);
    router.refresh();
  }

  return (
    <form className="space-y-2 text-sm" onSubmit={submit}>
      <label className="label" htmlFor="planner-import-file">
        File scaricato da Keyword Planner ({PLANNER_IMPORT_EXTENSIONS.join(" o ")}, massimo {MAX_MEGABYTES} MB)
      </label>
      <input
        id="planner-import-file"
        className="input"
        type="file"
        accept={PLANNER_IMPORT_EXTENSIONS.join(",")}
        onChange={(event) => setFile(event.target.files?.[0] ?? null)}
      />
      <button className="btn-primary w-full sm:w-auto" type="submit" disabled={!file || loading}>
        {loading ? "Import in corso..." : "Importa volumi"}
      </button>
      {(error || summary) && (
        <p className={error ? "text-red-700" : undefined} role={error ? "alert" : "status"}>
          {error ??
            `${summary?.matched} righe abbinate (${summary?.rangeRows} con volume a intervallo), ${summary?.updated} keyword aggiornate, ${summary?.unmatched} righe senza keyword corrispondente, ${summary?.withoutVolume} righe senza volume, ${summary?.skippedRows} righe scartate perché senza keyword o con valori non leggibili.`}
        </p>
      )}
    </form>
  );
}
