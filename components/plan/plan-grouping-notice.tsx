"use client";

import { useTranslations } from "next-intl";
import { useVolumesReasonText } from "@/components/volumes-reason-text";
import type { StrategyView } from "@/lib/modules/strategy/types";

type PlanGroupingNoticeProps = { grouping: { source: StrategyView["groupingSource"]; notice: StrategyView["groupingNotice"] } };

/**
 * Avviso sopra il piano (T-6202) quando il raggruppamento è quello di riserva: dice in parole semplici che le keyword
 * sono raggruppate per parole in comune e perché, con gli stessi testi di «Aggiungi i volumi» per i motivi dei volumi e
 * di DataForSEO; senza motivo (risultati e volumi arrivati, anche con i risultati di Google come fonte) nessun avviso.
 */
export function PlanGroupingNotice({ grouping: { notice } }: PlanGroupingNoticeProps) {
  const t = useTranslations("plan.grouping");
  const volumesReason = useVolumesReasonText(notice ? { kind: "notice", notice } : null);
  if (!notice) return null;
  const reason = notice === "PROVIDER_ERROR" || notice === "SERP_TIMEOUT" ? t(`reason.${notice}`) : volumesReason;

  return (
    <div role="status" className="space-y-1 rounded-2xl border border-[var(--surface-border)] p-3 text-sm">
      <p className="font-medium">{t("title")}</p>
      <p className="text-slate-600">{t("text")}</p>
      {reason && <p className="text-slate-600">{reason}</p>}
    </div>
  );
}
