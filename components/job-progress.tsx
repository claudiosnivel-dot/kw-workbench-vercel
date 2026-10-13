"use client";

import Link from "next/link";
import { useTranslations } from "next-intl";
import { ProgressBar } from "@/components/progress-bar";
import { isJobActive, useJobStatus } from "@/lib/client/use-job-status";

type JobProgressProps = {
  jobId: string;
  /** Pagina dei risultati, linkata a estrazione completata; senza, nessun link (barra del prossimo passo, T-2302). */
  resultsHref?: string;
  onCompleted?: () => void;
  /** Senza pulsante Annulla: la barra del prossimo passo mostra solo l'avanzamento (T-2302). */
  cancelable?: boolean;
};

/**
 * Avanzamento di un job di estrazione (T-1205): polling di GET /api/jobs/{jobId} con useJobStatus (ogni 2 s, intervallo
 * che raddoppia fino a 16 s sugli errori). Il messaggio d'errore del job è reso come testo (CWE-79).
 */
export function JobProgress({ jobId, resultsHref, onCompleted, cancelable = true }: JobProgressProps) {
  const t = useTranslations("jobs");
  const { job, pollError, canceling, cancel } = useJobStatus(jobId, onCompleted);
  const { done, total } = job.progress;
  const active = isJobActive(job.status);

  return (
    <div className="w-full space-y-2" aria-live="polite">
      <ProgressBar label={t("progress.ariaLabel")} done={done} total={total} />
      <p className="flex flex-wrap gap-2 text-sm text-slate-600">
        <span>{t(`progress.phase.${job.phase}`)}</span>
        <span>
          {done} / {total}
        </span>
      </p>
      {job.status === "completed" && resultsHref && (
        <Link className="btn-secondary inline-block w-full text-center sm:w-auto" href={resultsHref}>
          {t("progress.viewResults")}
        </Link>
      )}
      {job.status === "failed" && <p className="text-sm text-red-700">{job.error?.trim() || t("run.failed")}</p>}
      {job.status === "canceled" && <p className="text-sm text-slate-600">{t("progress.canceled")}</p>}
      {pollError && <p className="text-sm text-red-700">{pollError}</p>}
      {active && cancelable && (
        <button type="button" className="btn-secondary w-full sm:w-auto" onClick={cancel} disabled={canceling}>
          {canceling ? t("progress.canceling") : t("progress.cancel")}
        </button>
      )}
    </div>
  );
}
