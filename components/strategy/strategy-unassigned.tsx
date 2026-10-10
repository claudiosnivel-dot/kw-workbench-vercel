"use client";

import { useTranslations } from "next-intl";
import { FormFeedback } from "@/components/form-feedback";
import { KeywordMover, type MoveDestination } from "@/components/strategy/keyword-mover";
import { useStrategyOperations } from "@/lib/client/use-strategy-action";
import type { StrategyKeywordView } from "@/lib/modules/strategy/types";

type StrategyUnassignedProps = {
  projectId: string;
  strategyId: string;
  version: number;
  keywords: StrategyKeywordView[];
  destinations: MoveDestination[];
};

/** Riquadro Non assegnate (T-1905): numero delle keyword senza hub, motivo e spostamento in una pagina del piano. */
export function StrategyUnassigned({ projectId, strategyId, version, keywords, destinations }: StrategyUnassignedProps) {
  const t = useTranslations("strategy");
  const { pending, error, operate } = useStrategyOperations(projectId, strategyId, version);

  return (
    <section className="card space-y-3" aria-labelledby="strategy-unassigned">
      <h2 id="strategy-unassigned" className="text-lg font-semibold">
        {t("ui.unassignedTitle")}
      </h2>
      <p className="text-sm font-medium" data-testid="strategy-unassigned-count">
        {t("ui.unassignedCount", { count: keywords.length })}
      </p>
      {keywords.length === 0 ? (
        <p className="text-sm text-slate-500">{t("ui.unassignedEmpty")}</p>
      ) : (
        <>
          <p className="text-sm text-slate-600">{t("reasons.UNASSIGNED")}</p>
          <KeywordMover
            keywords={keywords}
            destinations={destinations}
            allowUnassigned={false}
            pending={pending}
            onMove={(keywordIds, targetPageId) => operate({ type: "move_keywords", keywordIds, targetPageId })}
          />
        </>
      )}
      <FormFeedback error={error} />
    </section>
  );
}
