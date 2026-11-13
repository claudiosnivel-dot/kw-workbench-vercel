"use client";

import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { ProgressBar } from "@/components/progress-bar";
import { usePlanRunStatus } from "@/lib/client/plan-run";
import { isApiErrorCode } from "@/lib/http/error-codes";
import type { PlanRunView } from "@/lib/modules/plan-runs/types";

type PlanRunProgressProps = {
  projectId: string;
  runId: string;
  /** Lavoro completed: la strategia è salvata. */
  onCompleted: (run: PlanRunView) => void;
  /** «Riprova» dopo un lavoro non riuscito. */
  onRetry: () => void;
};

/**
 * Avanzamento del lavoro di piano (T-6202): fase («Cerco i volumi», «Leggo i risultati di Google», «Raggruppo le
 * keyword», «Salvo il piano») con la barra e le keyword già lette, interrogando lo stato come la ricerca delle keyword
 * (T-1205). A lavoro completed chiama onCompleted; a lavoro non riuscito mostra il motivo dal catalogo (mai un testo del
 * server, CWE-79) e «Riprova».
 */
export function PlanRunProgress({ projectId, runId, onCompleted, onRetry }: PlanRunProgressProps) {
  const t = useTranslations("plan.run");
  const tErrors = useTranslations("errors");
  const { run, readError } = usePlanRunStatus(projectId, runId, (finished) => {
    if (finished.status === "completed") onCompleted(finished);
  });
  const { done, total } = run?.progress ?? { done: 0, total: 0 };
  const stopped = run?.status === "failed" || run?.status === "canceled";
  const code = run?.errorCode;
  const reason = code && code !== "INTERNAL_ERROR" && isApiErrorCode(code) ? tErrors(code) : t("failed");

  return (
    <div className="w-full space-y-2" aria-live="polite">
      <p className="font-medium">{t("title")}</p>
      {stopped ? (
        <div className="space-y-2">
          <p className="text-sm text-red-700" role="alert">
            {reason}
          </p>
          <button type="button" className="btn-secondary" onClick={onRetry}>
            {t("retry")}
          </button>
        </div>
      ) : (
        <>
          <ProgressBar label={t("progressLabel")} done={done} total={total} />
          <p className="flex flex-wrap gap-2 text-sm text-slate-600">
            <span>{t(`phase.${run?.phase ?? "volumes"}`)}</span>
            {total > 0 && <span>{t("keywords", { done, total })}</span>}
          </p>
          <p className="text-sm text-slate-600">{t("hint")}</p>
        </>
      )}
      {readError && <p className="text-sm text-red-700">{readError}</p>}
    </div>
  );
}

/**
 * Lavoro di piano già attivo all'apertura della pagina del piano (T-6202): l'avanzamento in una card; a lavoro finito, o
 * con «Riprova», la pagina si ricarica e mostra il piano nuovo o di nuovo il pulsante per costruirlo.
 */
export function ActivePlanRun({ projectId, runId }: { projectId: string; runId: string }) {
  const router = useRouter();
  const reload = () => router.refresh();
  return (
    <section className="card">
      <PlanRunProgress projectId={projectId} runId={runId} onCompleted={reload} onRetry={reload} />
    </section>
  );
}
