"use client";

import { useTranslations } from "next-intl";
import { useRouter, useSearchParams } from "next/navigation";
import { JobProgress } from "@/components/job-progress";
import { NextStepAction } from "@/components/next-step-action";
import { isApiErrorCode } from "@/lib/http/error-codes";
import { EXTRACTION_BLOCKED_PARAM, type ProjectProgressData } from "@/lib/modules/next-step";

type NextStepBarProps = {
  projectId: string;
  progress: Pick<ProjectProgressData, "next" | "keptCount" | "topics">;
  onAddTopic: () => void;
};

/**
 * Barra del prossimo passo in fondo alle pagine del progetto (T-2302, D-39): una riga di testo e un solo pulsante,
 * calcolati dallo stato del progetto. Durante una ricerca mostra il suo avanzamento senza pulsanti e a ricerca
 * completata aggiorna la pagina, così la barra passa al passo successivo.
 */
export function NextStepBar({ projectId, progress, onAddTopic }: NextStepBarProps) {
  const t = useTranslations("nextStep");
  const tErrors = useTranslations("errors");
  const router = useRouter();
  const searchParams = useSearchParams();
  const { next, keptCount, topics } = progress;
  const blocked = searchParams.get(EXTRACTION_BLOCKED_PARAM);

  let text: string;
  switch (next.kind) {
    case "add_topic":
      text = t("text.add_topic");
      break;
    case "searching":
      text = t("text.searching");
      break;
    case "run_topic":
      text = t("text.run_topic", { topic: topics.find((topic) => topic.id === next.topicId)?.name ?? "" });
      break;
    case "build_plan":
      text = t("text.build_plan", { count: keptCount });
      break;
    case "open_plan":
      text = t("text.open_plan");
      break;
    case "write_next":
      text = t("text.write_next", { title: next.page.h1, number: next.page.number });
      break;
    case "writing":
      text = t("text.writing", { count: next.count });
      break;
    case "plan_done":
      text = t("text.plan_done");
      break;
  }

  return (
    <section aria-label={t("label")} className="next-step-bar">
      <div className="min-w-0 flex-1 space-y-1">
        {/* Durante la ricerca la barra non propone un passo: dice solo che cosa sta succedendo. */}
        <p className="text-sm">
          {next.kind !== "searching" && <span className="font-semibold">{t("label")}: </span>}
          <span className="text-slate-600">{text}</span>
        </p>
        {/* Ricerca non partita all'avvio rapido o al nuovo argomento (T-2305): il messaggio del catalogo per il code. */}
        {next.kind !== "searching" && isApiErrorCode(blocked) && (
          <p className="text-sm text-amber-200" role="status">
            {t("notStarted", { reason: tErrors(blocked) })}
          </p>
        )}
      </div>
      {next.kind === "searching" ? (
        <div className="w-full sm:max-w-xs">
          <JobProgress key={next.jobId} jobId={next.jobId} cancelable={false} onCompleted={() => router.refresh()} />
        </div>
      ) : (
        <NextStepAction projectId={projectId} next={next} onAddTopic={onAddTopic} />
      )}
    </section>
  );
}
