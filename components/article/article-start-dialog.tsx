"use client";

import { useTranslations } from "next-intl";
import { useId, useState } from "react";
import { articleApiUrl, useArticleRequests } from "@/components/article/article-request";
import { DialogActions } from "@/components/dialog-actions";
import { ModalDialog } from "@/components/modal-dialog";
import { ARTICLE_LENGTHS, ARTICLE_WORD_CAPS, defaultArticleLength, estimateArticleRequests } from "@/lib/articles/lengths";
import type { ArticleLength } from "@/lib/generated/prisma/enums";
import type { StrategyPageKind } from "@/lib/modules/strategy/types";

const MAX_NOTES = 1000;

/** Pagina del piano di cui si scrive l'articolo: tipo, tipo di contenuto e numero di H2 danno lunghezza e stima. */
export type ArticleStartPage = { id: string; kind: StrategyPageKind; contentType: string; h2Count: number };

type ArticleStartDialogProps = {
  projectId: string;
  strategyId: string;
  page: ArticleStartPage;
  /** Dall'editor: l'articolo esiste e il nuovo sostituisce il testo, con l'avviso e il pulsante di conferma. */
  replace?: boolean;
  /** Dopo l'avvio: apre l'editor (dal pannello) o lo ricarica (dall'editor). */
  onStarted: () => void;
  onClose: () => void;
};

/**
 * Finestra «Scrivi l'articolo con l'AI» (T-4401): lunghezza (Lunga per la pilastro, Breve per una pagina locale, Media
 * per le altre), note fino a 1000 caratteri e stima delle richieste; «Scrivi» invia la POST dell'articolo (T-4002). Un
 * errore resta nella finestra con il testo del catalogo. Dall'editor dice che il testo attuale sarà sostituito e il
 * pulsante «Sostituisci e scrivi» vale da conferma.
 */
export function ArticleStartDialog({ projectId, strategyId, page, replace = false, onStarted, onClose }: ArticleStartDialogProps) {
  const t = useTranslations("article.start");
  const requests = useArticleRequests();
  const notesId = useId();
  const [length, setLength] = useState<ArticleLength>(() => defaultArticleLength(page));
  const [notes, setNotes] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async () => {
    setPending(true);
    setError(null);
    const result = await requests.send(articleApiUrl(projectId, strategyId, page.id), {
      method: "POST",
      body: { length, notes: notes.trim() || null },
    });
    setPending(false);
    if (result.ok) onStarted();
    else setError(requests.limited(result, "start.rateLimited"));
  };

  return (
    <ModalDialog title={replace ? t("replaceTitle") : t("title")} onClose={onClose}>
      <p className="text-sm text-slate-600">{t("intro")}</p>
      {replace && <p className="text-sm font-medium text-amber-200">{t("replaceWarning")}</p>}
      <fieldset className="space-y-2">
        <legend className="label">{t("length")}</legend>
        {ARTICLE_LENGTHS.map((option) => (
          <label key={option} className="flex items-center gap-2 text-sm">
            <input type="radio" name="article-length" value={option} checked={length === option} onChange={() => setLength(option)} />
            <span>
              {t(`lengths.${option}`)} <span className="text-slate-500">({t("lengthHint", { words: ARTICLE_WORD_CAPS[option] })})</span>
            </span>
          </label>
        ))}
      </fieldset>
      <div className="space-y-1">
        <label className="label" htmlFor={notesId}>
          {t("notes")}
        </label>
        <textarea id={notesId} className="input min-h-24" maxLength={MAX_NOTES} value={notes} onChange={(event) => setNotes(event.target.value)} />
        <p className="text-xs text-slate-500">{t("notesHint")}</p>
      </div>
      <p className="text-sm text-slate-600">{t("estimate", { count: estimateArticleRequests(page.h2Count) })}</p>
      <DialogActions error={error} cancel={{ label: t("cancel"), onClick: onClose, disabled: pending }}>
        <button type="button" className="btn-primary" disabled={pending} onClick={() => void submit()}>
          {pending ? t("starting") : replace ? t("replaceSubmit") : t("submit")}
        </button>
      </DialogActions>
    </ModalDialog>
  );
}
