"use client";

import { useTranslations } from "next-intl";
import { useId, useState } from "react";
import { DialogActions } from "@/components/dialog-actions";
import { ModalDialog } from "@/components/modal-dialog";
import type { PickOption } from "@/components/plan/pick-dialog";
import type { PlanRequestResult } from "@/components/plan/plan-requests";
import { STRATEGY_CONTENT_TYPES, type StrategyContentType, type StrategyKeywordView, type StrategyPageView } from "@/lib/modules/strategy/types";

/*
 * Angoli da valutare nel piano (T-6802, D-62): l'avviso in testa al piano, il riquadro di ogni angolo nel pannello della
 * pagina con le tre azioni e il foglio «Nuova pagina». Keyword e titoli sono resi come testo (CWE-79); le modifiche
 * passano dalle operazioni del piano (create_page, keep_angle, move_keywords).
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

type AngleBoxProps = {
  keyword: StrategyKeywordView;
  pending: boolean;
  onNewPage: () => void;
  onMove: () => void;
  onKeep: () => void;
};

/** Riquadro di un angolo nel pannello: etichetta, volume e le azioni «Fanne una pagina», «Sposta in…», «Tienila come H2». */
export function AngleBox({ keyword, pending, onNewPage, onMove, onKeep }: AngleBoxProps) {
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
  /** Pagina principale preselezionata: quella della keyword; vuota per nessuna. */
  defaultHubId: string;
  /** Crea la pagina: riuscita chiude il foglio (lo fa chi lo apre), altrimenti il messaggio resta nel foglio. */
  onCreate: (operation: CreatePageOperation) => Promise<PlanRequestResult>;
  onClose: () => void;
};

/** Foglio «Nuova pagina» da un angolo: pagina principale, H1 facoltativo, tipo, altri angoli da portare con sé. */
export function NewPageDialog({ keyword, others, hubs, defaultHubId, onCreate, onClose }: NewPageDialogProps) {
  const t = useTranslations("plan.newPage");
  const tStrategy = useTranslations("strategy.ui");
  const hubFieldId = useId();
  const h1FieldId = useId();
  const hintId = useId();
  const typeFieldId = useId();
  const [hubPageId, setHubPageId] = useState(hubs.some((hub) => hub.id === defaultHubId) ? defaultHubId : "");
  const [h1, setH1] = useState("");
  const [contentType, setContentType] = useState<StrategyContentType>("guide");
  const [brought, setBrought] = useState<Set<string>>(new Set());
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const toggle = (id: string, checked: boolean) =>
    setBrought((current) => {
      const next = new Set(current);
      if (checked) next.add(id);
      else next.delete(id);
      return next;
    });

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
            {t("h1Hint")}
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
