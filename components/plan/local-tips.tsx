"use client";

import { useTranslations } from "next-intl";
import { useState } from "react";
import { DialogActions } from "@/components/dialog-actions";
import { ModalDialog } from "@/components/modal-dialog";
import { type PlanRequestResult, usePlanRequests } from "@/components/plan/plan-requests";
import { messageOf, readApiResponse, sendJson } from "@/lib/client/http";
import { useCheckedSet } from "@/lib/client/use-checked-set";
import { MAX_BULK_IDS } from "@/lib/modules/keywords-options";
import type { StrategyKeywordView, StrategyPageView } from "@/lib/modules/strategy/types";

/*
 * Consigli sulla pagina locale con molte città (T-7001, T-7002, D-62): l'avviso in testa al piano, il riquadro nel
 * pannello con le due strade (scartare le città dove non si lavora, fare una pagina per quelle dove si hanno sedi o
 * clienti) e il dialogo «Scegli le città da scartare». Lo scarto passa dall'azione in blocco dei risultati (T-2401) con
 * le righe da cui vengono le keyword: il piano non cambia, le città escono alla prossima «Rigenera». «Fanne una pagina»
 * passa da create_page (T-6801). Keyword e titoli sono resi come testo (CWE-79).
 */

// Città del riquadro con «Fanne una pagina»: le altre stanno nel dialogo.
const TOP_PLACES = 5;

/**
 * Keyword della pagina per volume e poi priorità: a parità di volume resta l'ordine della vista (principale, poi
 * priorità); senza volume in fondo.
 */
const byVolume = (keywords: StrategyKeywordView[]) => [...keywords].sort((a, b) => (b.volume ?? -1) - (a.volume ?? -1));

/** Città da cui si può fare una pagina: tutte tranne la principale della pagina locale, che la pagina tiene. */
const canMakePage = (keyword: StrategyKeywordView) => keyword.role !== "MAIN";

/** Operazione di «Fanne una pagina» (T-7002): pagina locale sotto l'hub della pagina, H1 calcolato dal piano. */
export function localPageOperation(page: StrategyPageView, keyword: StrategyKeywordView) {
  return {
    type: "create_page" as const,
    keywordIds: [keyword.id],
    hubPageId: page.kind === "HUB" ? page.id : page.hubPageId,
    contentType: "local" as const,
  };
}

type LocalTipsNoticeProps = {
  page: StrategyPageView;
  /** Numero della pagina nell'ordine di lavoro, nel titolo quando le pagine locali con i consigli sono più di una. */
  number: number | null;
  onShow: () => void;
};

/** Avviso in testa al piano: «La pagina locale ha N città» con «Consigli», che apre il pannello della pagina. */
export function LocalTipsNotice({ page, number, onShow }: LocalTipsNoticeProps) {
  const t = useTranslations("plan.localTips");
  const count = page.keywords.length;
  const title = number === null ? t("noticeTitle", { count }) : t("noticeTitleNumbered", { count, number });

  return (
    <section aria-label={title} className="plan-local-notice">
      <div className="min-w-0 space-y-0.5">
        <p className="text-sm font-semibold">{title}</p>
        <p className="text-xs text-slate-600">{t("noticeHint")}</p>
      </div>
      <button type="button" className="btn-secondary plan-angle-button" onClick={onShow}>
        {t("show")}
      </button>
    </section>
  );
}

function PlaceVolume({ keyword }: { keyword: StrategyKeywordView }) {
  const t = useTranslations("plan.panel");
  return <span className="text-xs text-slate-600">{keyword.volume === null ? t("noVolume") : t("searches", { volume: keyword.volume })}</span>;
}

/** «Fanne una pagina» accanto a una città, con il nome della città per i lettori di schermo. */
function NewPlacePage({ keyword, disabled, onClick }: { keyword: StrategyKeywordView; disabled: boolean; onClick: () => void }) {
  const t = useTranslations("plan.localTips");
  return (
    <button
      type="button"
      className="btn-secondary btn-compact shrink-0"
      aria-label={t("newPageLabel", { keyword: keyword.keyword })}
      disabled={disabled}
      onClick={onClick}
    >
      {t("newPage")}
    </button>
  );
}

type LocalTipsBoxProps = {
  page: StrategyPageView;
  pending: boolean;
  onChoose: () => void;
  onNewPage: (keyword: StrategyKeywordView) => void;
};

/**
 * Riquadro dei consigli nel pannello della pagina locale (T-7001): «N città in una sola pagina», «Lavori in una zona
 * sola?» con «Scegli le città da scartare» e «Lavori in tutta Italia?» con le città più cercate e «Fanne una pagina»
 * (T-7002).
 */
export function LocalTipsBox({ page, pending, onChoose, onNewPage }: LocalTipsBoxProps) {
  const t = useTranslations("plan.localTips");
  const places = byVolume(page.keywords).filter(canMakePage);
  const top = places.slice(0, TOP_PLACES);
  const title = t("boxTitle", { count: page.keywords.length });

  return (
    <section aria-label={title} className="plan-local-box">
      <p className="font-semibold">{title}</p>
      <p className="text-sm text-slate-600">{t("boxText")}</p>
      <div className="plan-local-tip">
        <p className="font-semibold">{t("oneArea")}</p>
        <p className="text-sm text-slate-600">{t("oneAreaText")}</p>
        <button type="button" className="btn-secondary" disabled={pending} onClick={onChoose}>
          {t("choose")}
        </button>
      </div>
      <div className="plan-local-tip">
        <p className="font-semibold">{t("nationwide")}</p>
        <p className="text-sm text-slate-600">{t("nationwideText")}</p>
        {top.length > 0 && (
          <>
            <p className="label mb-0">{t("topPlaces")}</p>
            <ul className="space-y-1.5">
              {top.map((keyword) => (
                <li key={keyword.id} className="plan-place-row">
                  <span className="min-w-0">
                    <span className="block text-sm">{keyword.keyword}</span>
                    <PlaceVolume keyword={keyword} />
                  </span>
                  <NewPlacePage keyword={keyword} disabled={pending} onClick={() => onNewPage(keyword)} />
                </li>
              ))}
            </ul>
            {places.length > top.length && <p className="text-xs text-slate-600">{t("morePlaces", { count: places.length - top.length })}</p>}
          </>
        )}
      </div>
    </section>
  );
}

type DiscardPlacesDialogProps = {
  page: StrategyPageView;
  /** Fa una pagina dalla città (T-7002): riuscita chiude il dialogo (lo fa chi lo apre), altrimenti il messaggio resta qui. */
  onNewPage: (keyword: StrategyKeywordView) => Promise<PlanRequestResult>;
  onClose: () => void;
};

/**
 * Dialogo «Scegli le città da scartare» (T-7001): le keyword della pagina locale per volume e poi priorità, con le
 * caselle e «Fanne una pagina» accanto a ogni città (T-7002). «Scarta le città scelte» invia una sola PATCH dei
 * risultati con i source_keyword_id scelti (al massimo MAX_BULK_IDS); una keyword senza la sua riga dei risultati non si
 * può scegliere. Dopo la risposta il dialogo dice che le città escono alla prossima «Rigenera» e il piano non cambia.
 */
export function DiscardPlacesDialog({ page, onNewPage, onClose }: DiscardPlacesDialogProps) {
  const t = useTranslations("plan.localTips");
  const tErrors = useTranslations("errors");
  const tCommon = useTranslations("common");
  const requests = usePlanRequests();
  const { checked: chosen, toggle, clear } = useCheckedSet();
  const [discarded, setDiscarded] = useState<Set<string>>(new Set());
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const places = byVolume(page.keywords);
  const busy = pending || requests.pending;
  const tooMany = chosen.size > MAX_BULK_IDS;

  const discard = async () => {
    const ids = places.flatMap((keyword) => (chosen.has(keyword.id) && keyword.sourceKeywordId ? [keyword.sourceKeywordId] : []));
    setPending(true);
    setError(null);
    try {
      await readApiResponse(await sendJson("PATCH", `/api/projects/${requests.projectId}/results`, { action: "discard", ids }), tErrors);
      setDiscarded((current) => new Set([...current, ...chosen]));
      clear();
      setDone(true);
    } catch (discardError) {
      setError(messageOf(discardError, tCommon("unexpectedError")));
    } finally {
      setPending(false);
    }
  };

  const makePage = async (keyword: StrategyKeywordView) => {
    setError(null);
    const result = await onNewPage(keyword);
    if (!result.ok) setError(result.message);
  };

  const note = (keyword: StrategyKeywordView) =>
    discarded.has(keyword.id) ? t("discarded") : keyword.sourceKeywordId ? null : t("notSelectable");

  return (
    <ModalDialog title={t("dialogTitle")} onClose={onClose}>
      <div className="plan-local-dialog space-y-3">
        <p className="text-sm text-slate-600">{t("dialogText", { count: places.length })}</p>
        <ul className="space-y-1.5">
          {places.map((keyword) => (
            <li key={keyword.id} className="plan-place-row">
              <label className="plan-check min-w-0">
                <input
                  type="checkbox"
                  checked={chosen.has(keyword.id)}
                  disabled={busy || !keyword.sourceKeywordId || discarded.has(keyword.id)}
                  onChange={(event) => toggle(keyword.id, event.target.checked)}
                />
                <span className="min-w-0">
                  <span className="block">{keyword.keyword}</span>
                  <PlaceVolume keyword={keyword} />
                  {note(keyword) && <span className="text-xs text-slate-600"> · {note(keyword)}</span>}
                </span>
              </label>
              {canMakePage(keyword) && !discarded.has(keyword.id) && (
                <NewPlacePage keyword={keyword} disabled={busy} onClick={() => void makePage(keyword)} />
              )}
            </li>
          ))}
        </ul>
        {tooMany && <p className="text-sm text-amber-200">{t("tooMany", { max: MAX_BULK_IDS })}</p>}
        <p className="min-h-5 text-sm" role="status">
          {done ? t("done") : ""}
        </p>
        <DialogActions error={error} cancel={{ label: done ? t("close") : t("cancel"), onClick: onClose }}>
          <button type="button" className="btn-primary" disabled={busy || chosen.size === 0 || tooMany} onClick={() => void discard()}>
            {t("discard")}
          </button>
        </DialogActions>
      </div>
    </ModalDialog>
  );
}
