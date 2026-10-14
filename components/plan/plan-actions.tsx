"use client";

import Link from "next/link";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { EntityMenu } from "@/components/entity-menu";
import { ModalDialog } from "@/components/modal-dialog";
import { StrategySettings } from "@/components/strategy/strategy-settings";
import { planHref, planVersionsHref } from "@/lib/modules/next-step";
import type { StrategyRuleLimits, StrategyRules } from "@/lib/modules/strategy/types";

type PlanActionsProps = {
  projectId: string;
  plan: { id: string; name: string };
  versionCount: number;
  sections: { id: string; name: string }[];
  defaults: StrategyRules;
  limits: StrategyRuleLimits;
};

/**
 * Azioni del piano (T-2502): «Rigenera» apre il dialogo «Rigenera il piano» con le opzioni avanzate chiuse, il link alle
 * versioni precedenti e il menu ⋯ con «Elimina il piano», l'unica voce rossa (D-39).
 */
export function PlanActions({ projectId, plan, versionCount, sections, defaults, limits }: PlanActionsProps) {
  const t = useTranslations("plan");
  const [regenerating, setRegenerating] = useState(false);

  return (
    <div className="flex flex-wrap items-center gap-2">
      <button type="button" className="btn-secondary" onClick={() => setRegenerating(true)}>
        {t("regenerate")}
      </button>
      {versionCount > 0 && (
        <Link className="btn-secondary" href={planVersionsHref(projectId)}>
          {t("versions", { count: versionCount })}
        </Link>
      )}
      <EntityMenu
        label={t("menu")}
        items={[
          {
            kind: "delete",
            label: t("deletePlan"),
            dialog: {
              labels: {
                title: t("deleteTitle"),
                text: t("deleteText", { name: plan.name }),
                cancel: t("regenerateDialog.cancel"),
                confirm: t("deletePlan"),
              },
              endpoint: `/api/projects/${projectId}/strategies/${plan.id}`,
              redirectTo: planHref(projectId),
            },
          },
        ]}
      />
      {regenerating && (
        <ModalDialog title={t("regenerateDialog.title")} onClose={() => setRegenerating(false)}>
          <p className="text-sm text-slate-600">{t("regenerateDialog.text")}</p>
          <StrategySettings
            projectId={projectId}
            sections={sections}
            defaults={defaults}
            limits={limits}
            regenerate
            onCancel={() => setRegenerating(false)}
          />
        </ModalDialog>
      )}
    </div>
  );
}
