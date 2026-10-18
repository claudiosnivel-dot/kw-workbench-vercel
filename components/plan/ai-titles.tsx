"use client";

import { useFormatter, useTranslations } from "next-intl";
import { useId, useState } from "react";
import { type AiTitlesResult, type PlanRequestResult, usePlanRequests } from "@/components/plan/plan-requests";
import type { StrategyAiProposal, StrategyPageView } from "@/lib/modules/strategy/types";

export type AiTitlesProps = {
  page: StrategyPageView;
  /** Salva H1 e H2 della proposta con la PATCH della pagina e la version corrente (T-1904). */
  onUse: (proposal: StrategyAiProposal) => Promise<PlanRequestResult>;
};

/**
 * «Migliora i titoli con l'AI» nel pannello della pagina (T-3603, D-42 emendata da D-43): la proposta arriva in una card
 * con «Usa questi titoli» (PATCH dei titoli, poi DELETE della proposta) e «Scarta» (DELETE). La proposta salvata nella
 * pagina compare all'apertura senza richieste; una nuova la sostituisce. Gli errori lasciano titoli e proposta com'erano.
 * La card dice quanti H2 validi oltre il massimo non sono stati tenuti (T-3802, D-48). Titoli e modello sono resi come
 * testo (CWE-79).
 */
export function AiTitles({ page, onUse }: AiTitlesProps) {
  const t = useTranslations("plan.ai");
  const format = useFormatter();
  const requests = usePlanRequests();
  const cardId = useId();
  const [proposal, setProposal] = useState(page.aiProposal);
  const [busy, setBusy] = useState<"suggest" | "card" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [cardError, setCardError] = useState<string | null>(null);

  const failureMessage = (result: Extract<AiTitlesResult, { ok: false }>) =>
    result.code === "RATE_LIMITED" && result.retryAfterSeconds !== null
      ? t("rateLimited", {
          time: format.dateTime(new Date(Date.now() + result.retryAfterSeconds * 1000), { hour: "2-digit", minute: "2-digit" }),
        })
      : result.message;

  const suggest = async () => {
    setBusy("suggest");
    setError(null);
    setCardError(null);
    const result = await requests.suggestTitles(page.id);
    setBusy(null);
    if (result.ok) setProposal(result.proposal);
    else setError(failureMessage(result));
  };

  const discard = async (): Promise<void> => {
    const result = await requests.discardProposal(page.id);
    if (result.ok) setProposal(null);
    else setCardError(failureMessage(result));
  };

  const run = async (action: () => Promise<void>) => {
    setBusy("card");
    setCardError(null);
    await action();
    setBusy(null);
  };

  const use = async (current: StrategyAiProposal) => {
    const saved = await onUse(current);
    if (saved.ok) await discard();
    else setCardError(saved.message);
  };

  return (
    <div className="space-y-2">
      <button type="button" className="btn-secondary" disabled={busy !== null} onClick={() => void suggest()}>
        {busy === "suggest" ? t("loading") : t("suggest")}
      </button>
      {error && (
        <p className="text-sm text-red-700" role="alert">
          {error}
        </p>
      )}
      {proposal && (
        <section aria-labelledby={cardId} className="plan-ai-card space-y-2">
          <h3 id={cardId} className="text-sm font-semibold">
            {t("title")}
          </h3>
          <p className="font-semibold">{proposal.h1}</p>
          <ol className="list-decimal space-y-0.5 pl-5 text-sm">
            {proposal.h2.map((heading, index) => (
              <li key={`${index}-${heading}`}>{heading}</li>
            ))}
          </ol>
          {proposal.droppedH2 > 0 && <p className="text-xs text-slate-600">{t("droppedH2", { count: proposal.droppedH2 })}</p>}
          <p className="text-xs text-slate-600">{t("model", { model: proposal.model })}</p>
          {cardError && (
            <p className="text-sm text-red-700" role="alert">
              {cardError}
            </p>
          )}
          <div className="flex flex-wrap gap-2">
            <button type="button" className="btn-primary" disabled={busy !== null} onClick={() => void run(() => use(proposal))}>
              {t("use")}
            </button>
            <button type="button" className="btn-secondary" disabled={busy !== null} onClick={() => void run(discard)}>
              {t("discard")}
            </button>
          </div>
        </section>
      )}
    </div>
  );
}
