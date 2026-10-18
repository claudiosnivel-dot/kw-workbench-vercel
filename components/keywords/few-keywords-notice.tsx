"use client";

import { useTranslations } from "next-intl";
import { useState } from "react";
import { TopicSeedsDialog } from "@/components/topic-seeds-dialog";

/** Sotto questa soglia di keyword dell'argomento la ricerca ha trovato poco (D-44, scelta confermata il 2026-10-18). */
export const FEW_KEYWORDS_THRESHOLD = 20;

type FewKeywordsNoticeProps = {
  projectId: string;
  topicId: string;
  /** Parole di partenza attuali, per il dialogo «Parole di partenza». */
  seeds: string[];
  /** Keyword dell'argomento, tenute e scartate. */
  keywordCount: number;
  /** Una ricerca dell'argomento è in corso. */
  searching: boolean;
  /** L'argomento ha almeno una ricerca completata. */
  hasCompletedSearch: boolean;
};

/**
 * Avviso dei pochi suggerimenti (T-3703): a ricerca finita, un argomento con meno di 20 keyword invita a usare parole
 * più brevi o più generali, con il pulsante che apre il dialogo «Parole di partenza» (T-2404). Durante una ricerca,
 * senza ricerche completate o da 20 keyword in su non c'è.
 */
export function FewKeywordsNotice({ projectId, topicId, seeds, keywordCount, searching, hasCompletedSearch }: FewKeywordsNoticeProps) {
  const t = useTranslations("keywords.fewResults");
  const [seedsOpen, setSeedsOpen] = useState(false);
  if (searching || !hasCompletedSearch || keywordCount >= FEW_KEYWORDS_THRESHOLD) {
    return null;
  }

  return (
    <section
      aria-label={t("label")}
      className="flex flex-col gap-2 rounded-xl border border-amber-400/40 bg-amber-500/15 px-3 py-2 sm:flex-row sm:items-center sm:justify-between"
    >
      <p className="text-sm text-amber-200">{t("text")}</p>
      <button type="button" className="btn-secondary shrink-0" onClick={() => setSeedsOpen(true)}>
        {t("change")}
      </button>
      {seedsOpen && <TopicSeedsDialog projectId={projectId} topicId={topicId} seeds={seeds} onClose={() => setSeedsOpen(false)} />}
    </section>
  );
}
