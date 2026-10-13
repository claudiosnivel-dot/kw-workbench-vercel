"use client";

import Link from "next/link";
import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { readApiResponse, sendJson } from "@/lib/client/http";
import { useTopicSearch } from "@/lib/client/run-extraction";
import { usePendingAction } from "@/lib/client/use-pending-action";
import { type NextStep, strategyHref } from "@/lib/modules/next-step";
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
 * risultati, build_plan genera la strategia in modalità automatica e porta alla sua pagina, open_plan apre la strategia
 * più recente, searching porta ai risultati dell'argomento che si sta cercando.
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
      const payload = await readApiResponse<{ data: { id: string } }>(response, tErrors);
      return strategyHref(projectId, payload?.data.id);
    });

  let control;
  switch (next.kind) {
    case "add_topic":
      control = (
        <button type="button" className={className} onClick={onAddTopic}>
          {t("add_topic")}
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
      control = (
        <Link className={className} href={strategyHref(projectId, next.strategyId)}>
          {t("open_plan")}
        </Link>
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
