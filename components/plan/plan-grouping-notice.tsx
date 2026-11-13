"use client";

import { useTranslations } from "next-intl";
import { useVolumesReasonText } from "@/components/volumes-reason-text";
import type { StrategyView } from "@/lib/modules/strategy/types";

type PlanGroupingNoticeProps = { grouping: { source: StrategyView["groupingSource"]; notice: StrategyView["groupingNotice"] } };

/** Motivi con il testo proprio in plan.grouping.reason; gli altri sono quelli dei volumi (testi di «Aggiungi i volumi»). */
const OWN_REASONS = ["PROVIDER_ERROR", "SERP_TIMEOUT", "SERP_TOO_FEW", "AI_CLASSIFY_UNAVAILABLE", "AI_NOT_CONFIGURED"] as const;
type OwnReason = (typeof OWN_REASONS)[number];
const isOwnReason = (notice: string): notice is OwnReason => (OWN_REASONS as readonly string[]).includes(notice);

/**
 * Avviso sopra il piano (T-6202, T-6303) quando manca un dato: con il raggruppamento di riserva dice in parole semplici
 * che le keyword sono raggruppate per parole in comune e perché; con i risultati di Google come fonte dice perché manca
 * qualcosa (l'AI di luoghi e concorrenti, i volumi). I motivi dei volumi e di DataForSEO hanno gli stessi testi di
 * «Aggiungi i volumi»; senza motivo nessun avviso.
 */
export function PlanGroupingNotice({ grouping: { source, notice } }: PlanGroupingNoticeProps) {
  const t = useTranslations("plan.grouping");
  const volumesReason = useVolumesReasonText(notice ? { kind: "notice", notice } : null);
  if (!notice) return null;
  const reason = isOwnReason(notice) ? t(`reason.${notice}`) : volumesReason;
  const serp = source === "SERP";

  return (
    <div role="status" className="space-y-1 rounded-2xl border border-[var(--surface-border)] p-3 text-sm">
      <p className="font-medium">{t(serp ? "serpTitle" : "title")}</p>
      {!serp && <p className="text-slate-600">{t("text")}</p>}
      {reason && <p className="text-slate-600">{reason}</p>}
    </div>
  );
}
