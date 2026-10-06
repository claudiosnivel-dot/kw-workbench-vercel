"use client";

import { useFormatter, useTranslations } from "next-intl";
import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import { useApiData } from "@/lib/client/use-api-data";
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
  const t = useTranslations("export.plannerImport");
  const format = useFormatter();
  const router = useRouter();
  const [file, setFile] = useState<File | null>(null);
  const { data: summary, error, setError, loading, load } = useApiData<PlannerImportSummary>();

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!file) {
      return;
    }
    if (file.size > PLANNER_IMPORT_MAX_BYTES) {
      setError(t("tooLarge", { max: MAX_MEGABYTES }));
      return;
    }
    const body = new FormData();
    body.set("file", file);
    if (subprojectId) {
      body.set("sectionId", subprojectId);
    }
    if (await load(() => fetch(`/api/projects/${projectId}/planner-import`, { method: "POST", body }))) {
      router.refresh();
    }
  }

  return (
    <form className="space-y-2 text-sm" onSubmit={submit}>
      <label className="label" htmlFor="planner-import-file">
        {t("label", { extensions: format.list(PLANNER_IMPORT_EXTENSIONS, { type: "disjunction" }), max: MAX_MEGABYTES })}
      </label>
      <input
        id="planner-import-file"
        className="input"
        type="file"
        accept={PLANNER_IMPORT_EXTENSIONS.join(",")}
        onChange={(event) => setFile(event.target.files?.[0] ?? null)}
      />
      <button className="btn-primary w-full sm:w-auto" type="submit" disabled={!file || loading}>
        {loading ? t("importing") : t("submit")}
      </button>
      {(error || summary) && (
        <p className={error ? "text-red-700" : undefined} role={error ? "alert" : "status"}>
          {error ??
            (summary &&
              t("summary", {
                matched: summary.matched,
                rangeRows: summary.rangeRows,
                updated: summary.updated,
                unmatched: summary.unmatched,
                withoutVolume: summary.withoutVolume,
                skippedRows: summary.skippedRows,
              }))}
        </p>
      )}
    </form>
  );
}
