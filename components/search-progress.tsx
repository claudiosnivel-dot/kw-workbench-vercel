"use client";

import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { ProgressBar } from "@/components/progress-bar";
import { isJobActive, type JobPhase, useJobStatus } from "@/lib/client/use-job-status";

// Fasi in cui l'avanzamento conta le keyword trovate (progress.total = keyword deduplicate, T-1202).
const COUNTING_PHASES = new Set<JobPhase>(["metrics", "store"]);

/**
 * Riquadro della ricerca in corso sulla pagina di un argomento (T-2404): una frase con la fase in parole semplici, le
 * keyword trovate finora quando l'avanzamento le conta, «di solito ci vuole qualche minuto», la barra di avanzamento,
 * l'anteprima in sola lettura delle ultime keyword trovate e Annulla (T-1204). Niente parole tecniche (job, seed, fase).
 * A ricerca completata la pagina si aggiorna senza ricaricarsi: l'elenco mostra le keyword salvate. Le keyword sono rese
 * come testo (CWE-79).
 */
export function SearchProgress({ jobId }: { jobId: string }) {
  const t = useTranslations("keywords.searchProgress");
  const router = useRouter();
  const { job, pollError, canceling, cancel } = useJobStatus(jobId, () => router.refresh());
  const active = isJobActive(job.status);
  const preview = [...new Set(job.recentSuggestions ?? [])];

  return (
    <section aria-label={t("title")} className="search-progress" aria-live="polite">
      <p className="font-semibold">{t("title")}</p>
      {active && (
        <>
          <p className="text-sm text-slate-600">
            {t(`phase.${job.phase}`)}
            {COUNTING_PHASES.has(job.phase) && <> · {t("found", { count: job.progress.total })}</>}
          </p>
          <ProgressBar label={t("progress")} done={job.progress.done} total={job.progress.total} />
          <p className="text-xs text-slate-500">{t("duration")}</p>
          {preview.length > 0 && (
            <div className="space-y-1">
              <p className="text-xs font-semibold text-slate-600">{t("preview")}</p>
              <ul className="flex flex-wrap gap-1">
                {preview.map((keyword) => (
                  <li key={keyword} className="keyword-tag">
                    {keyword}
                  </li>
                ))}
              </ul>
              <p className="text-xs text-slate-500">{t("previewHint")}</p>
            </div>
          )}
          <button type="button" className="btn-secondary justify-self-start" onClick={cancel} disabled={canceling}>
            {canceling ? t("canceling") : t("cancel")}
          </button>
        </>
      )}
      {job.status === "failed" && <p className="text-sm text-red-700">{job.error?.trim() || t("failed")}</p>}
      {job.status === "canceled" && <p className="text-sm text-slate-600">{t("canceled")}</p>}
      {pollError && <p className="text-sm text-red-700">{pollError}</p>}
    </section>
  );
}
