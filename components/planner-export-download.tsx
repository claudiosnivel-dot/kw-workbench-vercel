"use client";

import { useTranslations } from "next-intl";
import { useApiData } from "@/lib/client/use-api-data";

type PlannerExportSummary = {
  canonicals: number;
  parts: number;
  skipped: { keyword: string; reason: string }[];
};

/** Download dei file per Keyword Planner (T-904), primo passo del round-trip dei volumi (D-09). */
export function PlannerExportDownload({ projectId, subprojectId }: { projectId: string; subprojectId: string | null }) {
  const t = useTranslations("export.planner");
  const { data: summary, error, loading, load } = useApiData<PlannerExportSummary>();

  const query = new URLSearchParams(subprojectId ? { sectionId: subprojectId } : {});
  const endpoint = `/api/projects/${projectId}/planner-export`;
  const partHref = (part: number) => `${endpoint}?${new URLSearchParams([...query, ["part", String(part)]])}`;

  const prepare = () => load(() => fetch(`${endpoint}?${query}`));

  return (
    <div className="space-y-2 text-sm">
      <p className="text-slate-600">{t("steps")}</p>
      <button className="btn-secondary w-full sm:w-auto" type="button" onClick={prepare} disabled={loading}>
        {loading ? t("preparing") : t("exportButton")}
      </button>
      {error && (
        <p className="text-red-700" role="alert">
          {error}
        </p>
      )}
      {summary && (
        <div className="space-y-1" role="status">
          <p>
            {summary.skipped.length > 0
              ? t("summaryWithSkipped", { canonicals: summary.canonicals, parts: summary.parts, skipped: summary.skipped.length })
              : t("summary", { canonicals: summary.canonicals, parts: summary.parts })}
          </p>
          <ul className="flex flex-wrap gap-2">
            {Array.from({ length: summary.parts }, (_, index) => (
              <li key={index}>
                <a className="btn-secondary" href={partHref(index + 1)} download>
                  {t("fileN", { n: index + 1 })}
                </a>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
