"use client";

import { useTranslations } from "next-intl";
import { useId, useState } from "react";
import { DialogActions } from "@/components/dialog-actions";
import { ModalDialog } from "@/components/modal-dialog";
import type { PickOption } from "@/components/plan/pick-dialog";
import type { PlanRequestResult } from "@/components/plan/plan-requests";
import { useCheckedSet } from "@/lib/client/use-checked-set";
import {
  STRATEGY_CONTENT_TYPES,
  type StrategyAngleAdvice,
  type StrategyContentType,
  type StrategyKeywordView,
  type StrategyPageView,
} from "@/lib/modules/strategy/types";

/*
 * Angoli da valutare nel piano (T-6802, D-62): l'avviso in testa al piano, il riquadro di ogni angolo nel pannello della
 * pagina con le tre azioni e il foglio «Nuova pagina». Con il consiglio dell'AI (T-6902) il riquadro dice l'azione
 * consigliata con il motivo e il foglio parte dall'hub e dall'H1 proposti; nessuna azione parte senza la conferma
 * dell'utente. Keyword, titoli e testi dell'AI sono resi come testo (CWE-79); le modifiche passano dalle operazioni del
 * piano (create_page, keep_angle, move_keywords).
 */

// Keyword citate nell'avviso: le altre si contano.
const NOTICE_KEYWORDS = 5;

/** Angoli da valutare della pagina. */
export const anglesOf = (page: StrategyPageView): StrategyKeywordView[] => page.keywords.filter((keyword) => keyword.angle);

/** Avviso in testa al piano con gli angoli nell'ordine di lavoro; «Vedi gli angoli» apre la prima pagina che ne ha. */
export function PlanAnglesNotice({ angles, onShow }: { angles: StrategyKeywordView[]; onShow: () => void }) {
  const t = useTranslations("plan.angles");
  const titleId = useId();
  if (angles.length === 0) return null;
  const shown = angles.slice(0, NOTICE_KEYWORDS);

  return (
    <section aria-labelledby={titleId} className="plan-angle-notice space-y-2 text-sm">
      <p id={titleId} className="font-semibold">
        {t("title", { count: angles.length })}
      </p>
      <p className="text-slate-600">
        {t("text", {
          keywords: shown.map((keyword) => t("quoted", { keyword: keyword.keyword })).join(", "),
          more: angles.length - shown.length,
        })}
      </p>
      <button type="button" className="btn-secondary plan-angle-button" onClick={onShow}>
        {t("show")}
      </button>
    </section>
  );
}

/** Etichetta «N angoli» di una scheda o di una riga del piano; niente senza angoli. */
export function AngleCount({ page }: { page: StrategyPageView }) {
  const t = useTranslations("plan.angles");
  const count = anglesOf(page).length;
  return count > 0 ? <span className="plan-angle-chip">{t("count", { count })}</span> : null;
}

/** Consiglio dell'AI mostrato in un riquadro (T-6902): per intero o in una riga breve, con l'etichetta della pagina target. */
export type AngleAdviceDisplay = { value: StrategyAngleAdvice; full: boolean; pageLabel: string | null };

/** Consiglio dell'AI nel riquadro: «Consiglio dell'AI: …» con motivo e alternativa, o la sola riga «AI: …». */
function AngleAdviceNote({ advice }: { advice: AngleAdviceDisplay }) {
  const t = useTranslations("plan.angles.advice");
  const { value, full, pageLabel } = advice;
  const action =
    value.action === "page"
      ? t("page")
      : value.action === "keep"
        ? t("keep")
        : pageLabel
          ? t("move", { page: pageLabel })
          : t("moveElsewhere");
  if (!full) return <p className="text-xs text-slate-600">{t("short", { action })}</p>;
  return (
    <div className="plan-angle-advice">
      <p className="flex items-center gap-1.5 font-semibold">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
          <path d="M12 3l1.8 4.6L18 9.4l-4.2 1.8L12 16l-1.8-4.8L6 9.4l4.2-1.8z" />
        </svg>
        <span>{t("title", { action })}</span>
      </p>
      <p>{value.reason}</p>
      {value.alternative && <p className="text-xs text-slate-600">{t("alternative", { text: value.alternative })}</p>}
    </div>
  );
}

type AngleBoxProps = {
  keyword: StrategyKeywordView;
  pending: boolean;
  /** Consiglio dell'AI sull'angolo (T-6902), se c'è. */
  advice?: AngleAdviceDisplay | null;
  onNewPage: () => void;
  onMove: () => void;
  onKeep: () => void;
};

/**
 * Riquadro di un angolo nel pannello: etichetta, volume, consiglio dell'AI se c'è (T-6902) e le azioni «Fanne una
 * pagina», «Sposta in…», «Tienila come H2».
 */
export function AngleBox({ keyword, pending, advice, onNewPage, onMove, onKeep }: AngleBoxProps) {
  const t = useTranslations("plan.angles");
  const tPanel = useTranslations("plan.panel");

  return (
    <section aria-label={t("region", { keyword: keyword.keyword })} className="plan-angle-box">
      <div className="flex flex-wrap items-center gap-2">
        <span className="plan-angle-chip">{t("label")}</span>
        <span className="text-xs text-slate-600">
          {keyword.volume === null ? tPanel("noVolume") : tPanel("searches", { volume: keyword.volume })}
        </span>
      </div>
      <p className="font-semibold">{keyword.keyword}</p>
      {advice && <AngleAdviceNote advice={advice} />}
      <div className="plan-angle-actions">
        <button type="button" className="btn-secondary" disabled={pending} onClick={onNewPage}>
          {t("newPage")}
        </button>
        <button type="button" className="btn-secondary" disabled={pending} onClick={onMove}>
          {tPanel("moveKeyword")}
        </button>
        <button type="button" className="btn-secondary" disabled={pending} onClick={onKeep}>
          {t("keep")}
        </button>
      </div>
    </section>
  );
}

/** Corpo dell'operazione create_page (T-6801): la prima keyword è la principale; hubPageId null crea una pagina principale. */
export type CreatePageOperation = {
  type: "create_page";
  keywordIds: string[];
  hubPageId: string | null;
  h1?: string;
  contentType: StrategyContentType;
};

type NewPageDialogProps = {
  keyword: StrategyKeywordView;
  /** Gli altri angoli della stessa pagina, per «Porta con te anche». */
  others: StrategyKeywordView[];
  /** Pagine principali del piano, con l'etichetta numerata. */
  hubs: PickOption[];
  /** Pagina principale preselezionata: quella del consiglio dell'AI o quella della keyword; vuota per nessuna. */
  defaultHubId: string;
  /** H1 proposto dall'AI (T-6902): il campo parte da qui con «Proposto dall'AI · puoi cambiarlo». */
  proposedH1?: string | null;
  /** Crea la pagina: riuscita chiude il foglio (lo fa chi lo apre), altrimenti il messaggio resta nel foglio. */
  onCreate: (operation: CreatePageOperation) => Promise<PlanRequestResult>;
  onClose: () => void;
};

/** Foglio «Nuova pagina» da un angolo: pagina principale, H1 facoltativo, tipo, altri angoli da portare con sé. */
export function NewPageDialog({ keyword, others, hubs, defaultHubId, proposedH1, onCreate, onClose }: NewPageDialogProps) {
  const t = useTranslations("plan.newPage");
  const tStrategy = useTranslations("strategy.ui");
  const hubFieldId = useId();
  const h1FieldId = useId();
  const hintId = useId();
  const typeFieldId = useId();
  const [hubPageId, setHubPageId] = useState(hubs.some((hub) => hub.id === defaultHubId) ? defaultHubId : "");
  const [h1, setH1] = useState(proposedH1 ?? "");
  const [contentType, setContentType] = useState<StrategyContentType>("guide");
  const { checked: brought, toggle } = useCheckedSet();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const create = async () => {
    setPending(true);
    setError(null);
    const title = h1.trim();
    const result = await onCreate({
      type: "create_page",
      keywordIds: [keyword.id, ...others.filter((other) => brought.has(other.id)).map((other) => other.id)],
      hubPageId: hubPageId || null,
      ...(title ? { h1: title } : {}),
      contentType,
    });
    setPending(false);
    if (!result.ok) setError(result.message);
  };

  return (
    <ModalDialog title={t("title")} onClose={onClose}>
      <div className="plan-new-page space-y-3">
        <p className="text-sm text-slate-600">{t("from", { keyword: keyword.keyword })}</p>
        <label className="block" htmlFor={hubFieldId}>
          <span className="label">{t("hub")}</span>
          <select id={hubFieldId} className="select" value={hubPageId} onChange={(event) => setHubPageId(event.target.value)}>
            {hubs.map((hub) => (
              <option key={hub.id} value={hub.id}>
                {hub.label}
              </option>
            ))}
            <option value="">{t("noHub")}</option>
          </select>
        </label>
        <div className="space-y-1">
          <label className="label mb-0" htmlFor={h1FieldId}>
            {t("h1")}
          </label>
          <input
            id={h1FieldId}
            className="input"
            value={h1}
            maxLength={200}
            aria-describedby={hintId}
            onChange={(event) => setH1(event.target.value)}
          />
          <p id={hintId} className="text-xs text-slate-600">
            {proposedH1 && h1 === proposedH1 ? t("proposed") : t("h1Hint")}
          </p>
        </div>
        <label className="block" htmlFor={typeFieldId}>
          <span className="label">{t("contentType")}</span>
          <select
            id={typeFieldId}
            className="select"
            value={contentType}
            onChange={(event) => setContentType(event.target.value as StrategyContentType)}
          >
            {STRATEGY_CONTENT_TYPES.map((type) => (
              <option key={type} value={type}>
                {tStrategy(`contentTypes.${type}`)}
              </option>
            ))}
          </select>
        </label>
        {others.length > 0 && (
          <fieldset className="space-y-1">
            <legend className="label">{t("bring")}</legend>
            {others.map((other) => (
              <label key={other.id} className="plan-check">
                <input type="checkbox" checked={brought.has(other.id)} onChange={(event) => toggle(other.id, event.target.checked)} />
                <span>{other.keyword}</span>
              </label>
            ))}
          </fieldset>
        )}
        <p className="text-xs text-slate-600">{t("note")}</p>
        <DialogActions error={error} cancel={{ label: t("cancel"), onClick: onClose }}>
          <button type="button" className="btn-primary" disabled={pending} onClick={() => void create()}>
            {t("create")}
          </button>
        </DialogActions>
      </div>
    </ModalDialog>
  );
}
