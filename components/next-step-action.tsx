"use client";

import Link from "next/link";
import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { readApiResponse, sendJson } from "@/lib/client/http";
import { useTopicSearch } from "@/lib/client/run-extraction";
import { usePendingAction } from "@/lib/client/use-pending-action";
import { type NextStep, planHref } from "@/lib/modules/next-step";
import { keywordsHref } from "@/lib/modules/results-view";

type NextStepActionProps = {
  projectId: string;
  next: NextStep;
  /** Apre il dialogo Nuovo argomento (T-2303) del progetto. */
  onAddTopic: () => void;
  /** Pulsante primario pieno (uno per schermata, D-39) oppure secondario. */
  primary?: boolean;
};

/**
 * Il solo pulsante del prossimo passo di un progetto (T-2302, T-2305), uguale nella barra del progetto e nelle schede
 * della home: add_topic apre il dialogo Nuovo argomento, run_topic avvia la ricerca dell'argomento e porta ai suoi
 * risultati, build_plan genera il piano in modalità automatica e lo apre, open_plan e writing aprono il piano,
 * write_next mette in scrittura la prossima pagina e ne apre il pannello (T-2506), plan_done apre il dialogo Nuovo
 * argomento, searching porta ai risultati dell'argomento che si sta cercando.
 */
export function NextStepAction({ projectId, next, onAddTopic, primary = true }: NextStepActionProps) {
  const t = useTranslations("nextStep.actions");
  const tErrors = useTranslations("errors");
  const startSearch = useTopicSearch();
  const router = useRouter();
  const { pending, error, run } = usePendingAction();
  const className = `${primary ? "btn-primary" : "btn-secondary"} w-full text-center sm:w-auto`;

  // Esegue l'azione e va alla pagina che restituisce; il refresh aggiorna anche il layout del progetto.
  const perform = (action: () => Promise<string>) =>
    run(async () => {
      router.push(await action());
      router.refresh();
    });

  const runTopic = (topicId: string) =>
    perform(async () => {
      await startSearch(projectId, topicId);
      return keywordsHref(projectId, { subprojectId: topicId });
    });

  const buildPlan = () =>
    perform(async () => {
      const response = await sendJson("POST", `/api/projects/${projectId}/strategies`, { mode: "AUTO" });
      await readApiResponse<{ data: { id: string } }>(response, tErrors);
      return planHref(projectId);
    });

  const startWriting = (strategyId: string, version: number, pageId: string) =>
    perform(async () => {
      const response = await sendJson("PATCH", `/api/projects/${projectId}/strategies/${strategyId}/pages/${pageId}`, {
        version,
        status: "WRITING",
      });
      await readApiResponse<{ data: { version: number } }>(response, tErrors);
      return planHref(projectId, { page: pageId });
    });

  let control;
  switch (next.kind) {
    case "add_topic":
    case "plan_done":
      control = (
        <button type="button" className={className} onClick={onAddTopic}>
          {t(next.kind)}
        </button>
      );
      break;
    case "run_topic":
      control = (
        <button type="button" className={className} disabled={pending} onClick={() => runTopic(next.topicId)}>
          {t("run_topic")}
        </button>
      );
      break;
    case "build_plan":
      control = (
        <button type="button" className={className} disabled={pending} onClick={buildPlan}>
          {pending ? t("building") : t("build_plan")}
        </button>
      );
      break;
    case "open_plan":
    case "writing":
      control = (
        <Link className={className} href={planHref(projectId, next.kind === "writing" ? { group: "status" } : {})}>
          {t(next.kind)}
        </Link>
      );
      break;
    case "write_next":
      control = (
        <button
          type="button"
          className={className}
          disabled={pending}
          onClick={() => startWriting(next.strategyId, next.version, next.page.id)}
        >
          {t("write_next")}
        </button>
      );
      break;
    case "searching":
      control = (
        <Link className={className} href={keywordsHref(projectId, { subprojectId: next.topicId })}>
          {t("searching")}
        </Link>
      );
      break;
  }

  return (
    <div className="flex w-full flex-col gap-1 sm:w-auto sm:items-end">
      {control}
      {error && (
        <p className="text-sm text-red-700" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
