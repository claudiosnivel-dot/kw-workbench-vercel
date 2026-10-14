"use client";

import { useTranslations } from "next-intl";
import { type ReactNode, useEffect, useId, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { DialogActions } from "@/components/dialog-actions";
import { EntityMenu, type EntityMenuItem } from "@/components/entity-menu";
import { ModalDialog } from "@/components/modal-dialog";
import { type PickGroup, PickDialog } from "@/components/plan/pick-dialog";
import { type PlanRequestResult, usePlanRequests } from "@/components/plan/plan-requests";
import { StatusLabel } from "@/components/plan/status-menu";
import { useModalFocus } from "@/lib/client/use-modal-focus";
import {
  STRATEGY_CONTENT_TYPES,
  STRATEGY_PAGE_STATUSES,
  type StrategyKeywordView,
  type StrategyPageStatus,
  type StrategyPageView,
} from "@/lib/modules/strategy/types";

// Attesa senza digitare prima del salvataggio automatico di H1 e H2 (T-2505).
const AUTOSAVE_DELAY_MS = 800;

export type PagePanelProps = {
  page: StrategyPageView;
  /** Pagina principale di un approfondimento; null per le pagine principali. */
  hub: StrategyPageView | null;
  /** H1 delle pagine collegate: lo spoke verso il proprio hub, l'hub verso i propri spoke. */
  links: string[];
  /** Le altre pagine del piano per pagina principale: destinazioni di «Sposta in…» e «Unisci a…». */
  destinations: PickGroup[];
  /** Versione precedente del piano: solo lettura, senza campi né menu. */
  readOnly: boolean;
  onClose: () => void;
};

type Field = "h1" | "h2";
type Dialog = { kind: "move"; keyword: StrategyKeywordView } | { kind: "merge" } | { kind: "delete" } | null;

const toLines = (text: string) =>
  text
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="space-y-1.5">
      <h3 className="text-sm font-semibold">{title}</h3>
      {children}
    </section>
  );
}

/**
 * Pannello di dettaglio di una pagina del piano (T-2505): relazione, stato, H1 e H2 (con «suggerito» finché l'utente
 * non li riscrive), tipo, keyword con «Sposta in…» e «Togli», motivo e collegamenti; le azioni rare nel menu ⋯. Si
 * modifica scrivendo: H1 e H2 si salvano all'uscita dal campo o dopo 800 ms senza digitare, sempre con la version
 * corrente (CWE-362). Un errore di validazione resta sotto il campo senza perdere il testo; dopo un 409
 * STRATEGY_CONFLICT il piano si ricarica con il suo messaggio. Esc chiude e il focus torna alla scheda. Tutti i testi
 * del piano sono resi come testo (CWE-79).
 */
export function PagePanel({ page, hub, links, destinations, readOnly, onClose }: PagePanelProps) {
  const t = useTranslations("plan.panel");
  const tPick = useTranslations("plan.pick");
  const tStrategy = useTranslations("strategy");
  const requests = usePlanRequests();
  const titleId = useId();
  const h1Id = useId();
  const h2Id = useId();
  const statusId = useId();
  const typeId = useId();
  const panelRef = useRef<HTMLElement>(null);
  const timers = useRef<Partial<Record<Field, ReturnType<typeof setTimeout>>>>({});
  const [drafts, setDrafts] = useState<Partial<Record<Field, string>>>({});
  const [edited, setEdited] = useState<Partial<Record<Field, boolean>>>({});
  const [fieldError, setFieldError] = useState<{ field: Field | "status" | "contentType"; message: string } | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [saveState, setSaveState] = useState<"idle" | "saving" | "saved">("idle");
  const [localStatus, setLocalStatus] = useState<StrategyPageStatus | null>(null);
  const [localType, setLocalType] = useState<string | null>(null);
  const [dialog, setDialog] = useState<Dialog>(null);
  useModalFocus(true, panelRef, onClose);

  // I salvataggi in attesa non partono più dopo la chiusura del pannello.
  useEffect(() => {
    const pending = timers.current;
    return () => Object.values(pending).forEach((timer) => clearTimeout(timer));
  }, []);

  const current = { h1: page.h1, h2: page.h2.join("\n") };
  const valueOf = (field: Field) => drafts[field] ?? current[field];
  const status = localStatus ?? page.status;
  const contentType = localType ?? page.contentType;

  const save = async (field: Field | "status" | "contentType", patch: Record<string, unknown>): Promise<void> => {
    setSaveState("saving");
    setFieldError(null);
    setMessage(null);
    const result = await requests.patchPage(page.id, patch);
    if (result.ok) {
      setSaveState("saved");
      if (field === "h1" || field === "h2") setEdited((value) => ({ ...value, [field]: true }));
      return;
    }
    setSaveState("idle");
    if (result.code === "STRATEGY_CONFLICT") {
      // Il piano si ricarica: i campi ripartono dai valori dell'ultima versione.
      setDrafts({});
      setLocalStatus(null);
      setLocalType(null);
      setMessage(result.message);
      return;
    }
    setFieldError({ field, message: result.message });
  };

  const flush = (field: Field, value: string) => {
    clearTimeout(timers.current[field]);
    delete timers.current[field];
    if (field === "h1") {
      if (value.trim() !== page.h1) void save("h1", { h1: value.trim() });
    } else if (toLines(value).join("\n") !== page.h2.join("\n")) {
      void save("h2", { h2: toLines(value) });
    }
  };

  const change = (field: Field, value: string) => {
    setDrafts((current) => ({ ...current, [field]: value }));
    setSaveState("idle");
    clearTimeout(timers.current[field]);
    timers.current[field] = setTimeout(() => flush(field, value), AUTOSAVE_DELAY_MS);
  };

  // All'uscita dal campo si salva subito solo se un salvataggio era in attesa.
  const blur = (field: Field) => {
    if (timers.current[field] !== undefined) flush(field, valueOf(field));
  };

  const operate = async (operation: Record<string, unknown> & { type: string }): Promise<PlanRequestResult> => {
    setMessage(null);
    const result = await requests.operate(operation);
    if (!result.ok) setMessage(result.message);
    return result;
  };

  const otherDestinations = destinations
    .map((group) => ({ ...group, options: group.options.filter((option) => option.id !== page.id) }))
    .filter((group) => group.options.length > 0);
  const menuItems: EntityMenuItem[] = [
    { kind: "action", label: t("merge"), onSelect: () => setDialog({ kind: "merge" }) },
    ...(page.kind === "SPOKE"
      ? [{ kind: "action" as const, label: t("promote"), onSelect: () => void operate({ type: "promote_to_hub", pageId: page.id }) }]
      : []),
    { kind: "action", label: t("delete"), onSelect: () => setDialog({ kind: "delete" }) },
  ];

  const params = page.reason.params;
  const merged = Number(params.merged ?? 0);
  const faq = Number(params.faq ?? 0);
  const suggested = (field: Field) =>
    !(field === "h1" ? page.h1Edited : page.h2Edited) && !edited[field] ? <span className="status-chip">{t("suggested")}</span> : null;
  const errorOf = (field: Field | "status" | "contentType") =>
    fieldError?.field === field ? (
      <p className="text-sm text-red-700" role="alert">
        {fieldError.message}
      </p>
    ) : null;

  return createPortal(
    <div className="plan-panel-backdrop" onClick={onClose}>
      <aside
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="plan-panel space-y-5"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3">
          <p className="text-sm text-slate-600">
            {page.kind === "HUB" || !hub ? t("relationPillar") : t("relationSpoke", { hub: hub.h1 })}
          </p>
          <div className="flex items-center gap-2">
            {!readOnly && <EntityMenu label={t("menu")} items={menuItems} />}
            <button type="button" className="btn-secondary" onClick={onClose}>
              {t("close")}
            </button>
          </div>
        </div>

        {readOnly ? (
          <>
            <h2 id={titleId} className="text-xl font-semibold">
              {page.h1}
            </h2>
            <p className="text-sm text-slate-600">{t("readOnly")}</p>
            <div className="flex flex-wrap items-center gap-2 text-sm">
              <StatusLabel status={page.status} />
              <span>{tStrategy(`ui.contentTypes.${page.contentType}`)}</span>
            </div>
            <Section title={t("h2")}>
              {page.h2.length > 0 ? (
                <ol className="list-decimal space-y-0.5 pl-5 text-sm">
                  {page.h2.map((heading, index) => (
                    <li key={`${index}-${heading}`}>{heading}</li>
                  ))}
                </ol>
              ) : (
                <p className="text-sm text-slate-500">{t("noH2")}</p>
              )}
            </Section>
          </>
        ) : (
          <>
            <h2 id={titleId} className="sr-only">
              {page.h1}
            </h2>
            {message && (
              <p className="text-sm text-amber-200" role="alert">
                {message}
              </p>
            )}
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="block" htmlFor={statusId}>
                <span className="label">{t("status")}</span>
                <select
                  id={statusId}
                  className="select"
                  value={status}
                  onChange={(event) => {
                    const next = event.target.value as StrategyPageStatus;
                    setLocalStatus(next);
                    void save("status", { status: next });
                  }}
                >
                  {STRATEGY_PAGE_STATUSES.map((option) => (
                    <option key={option} value={option}>
                      {tStrategy(`status.${option}`)}
                    </option>
                  ))}
                </select>
                {errorOf("status")}
              </label>
              <label className="block" htmlFor={typeId}>
                <span className="label">{t("contentType")}</span>
                <select
                  id={typeId}
                  className="select"
                  value={contentType}
                  onChange={(event) => {
                    setLocalType(event.target.value);
                    void save("contentType", { contentType: event.target.value });
                  }}
                >
                  {STRATEGY_CONTENT_TYPES.map((type) => (
                    <option key={type} value={type}>
                      {tStrategy(`ui.contentTypes.${type}`)}
                    </option>
                  ))}
                </select>
                {errorOf("contentType")}
              </label>
            </div>

            <div className="space-y-1">
              <div className="flex flex-wrap items-center gap-2">
                <label className="label mb-0" htmlFor={h1Id}>
                  {t("h1")}
                </label>
                {suggested("h1")}
              </div>
              <input
                id={h1Id}
                className="input"
                value={valueOf("h1")}
                maxLength={200}
                onChange={(event) => change("h1", event.target.value)}
                onBlur={() => blur("h1")}
              />
              {errorOf("h1")}
            </div>

            <div className="space-y-1">
              <div className="flex flex-wrap items-center gap-2">
                <label className="label mb-0" htmlFor={h2Id}>
                  {t("h2")}
                </label>
                {suggested("h2")}
              </div>
              <textarea
                id={h2Id}
                className="input min-h-40"
                value={valueOf("h2")}
                onChange={(event) => change("h2", event.target.value)}
                onBlur={() => blur("h2")}
              />
              {errorOf("h2")}
            </div>

            <p className="min-h-5 text-sm text-slate-600" role="status">
              {saveState === "saving" ? t("saving") : saveState === "saved" ? t("saved") : ""}
            </p>
          </>
        )}

        <Section title={t("keywords")}>
          <ul className="space-y-1.5 text-sm">
            {page.keywords.map((keyword) => (
              <li key={keyword.id} className="flex flex-wrap items-center gap-2">
                <span className={keyword.role === "MAIN" ? "font-semibold" : undefined}>{keyword.keyword}</span>
                {keyword.role === "MAIN" && <span className="status-chip">{t("main")}</span>}
                <span className="text-xs text-slate-500">
                  {keyword.volume === null ? t("noVolume") : t("searches", { volume: keyword.volume })}
                </span>
                {!readOnly && (
                  <span className="ml-auto flex gap-1">
                    <button
                      type="button"
                      className="btn-secondary btn-compact"
                      aria-label={t("moveKeywordLabel", { keyword: keyword.keyword })}
                      onClick={() => setDialog({ kind: "move", keyword })}
                    >
                      {t("moveKeyword")}
                    </button>
                    <button
                      type="button"
                      className="btn-secondary btn-compact"
                      aria-label={t("removeKeywordLabel", { keyword: keyword.keyword })}
                      disabled={requests.pending}
                      onClick={() => void operate({ type: "move_keywords", keywordIds: [keyword.id], targetPageId: null })}
                    >
                      {t("removeKeyword")}
                    </button>
                  </span>
                )}
              </li>
            ))}
          </ul>
        </Section>

        <Section title={t("reason")}>
          <p className="text-sm text-slate-600">{tStrategy(`reasons.${page.reason.code}` as "reasons.HUB_SEED", params as never)}</p>
          {merged > 0 && <p className="text-sm text-slate-600">{tStrategy("reasons.MERGED_INTO_PILLAR", { count: merged })}</p>}
          {faq > 0 && <p className="text-sm text-slate-600">{tStrategy("ui.faqCount", { count: faq })}</p>}
        </Section>

        <Section title={t("links")}>
          {links.length > 0 ? (
            <ul className="list-disc pl-5 text-sm">
              {links.map((link, index) => (
                <li key={`${index}-${link}`}>{link}</li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-slate-500">{t("noLinks")}</p>
          )}
        </Section>

        {dialog?.kind === "move" && (
          <PickDialog
            labels={{
              title: tPick("keywordTitle", { keyword: dialog.keyword.keyword }),
              field: tPick("pageLabel"),
              cancel: tPick("cancel"),
              confirm: tPick("confirm"),
            }}
            groups={otherDestinations}
            onPick={(targetPageId) => operate({ type: "move_keywords", keywordIds: [dialog.keyword.id], targetPageId })}
            onClose={() => setDialog(null)}
          />
        )}
        {dialog?.kind === "merge" && (
          <PickDialog
            labels={{ title: tPick("mergeTitle"), field: tPick("mergeLabel"), cancel: tPick("cancel"), confirm: tPick("merge") }}
            groups={otherDestinations}
            onPick={(targetPageId) => operate({ type: "merge_pages", sourcePageId: page.id, targetPageId })}
            onClose={() => setDialog(null)}
          />
        )}
        {dialog?.kind === "delete" && (
          <ModalDialog title={t("deleteTitle")} onClose={() => setDialog(null)}>
            <p className="text-sm text-slate-600">{t("deleteText", { title: page.h1 })}</p>
            <DialogActions error={message} cancel={{ label: tPick("cancel"), onClick: () => setDialog(null) }}>
              <button
                type="button"
                className="btn-danger"
                disabled={requests.pending}
                onClick={async () => {
                  if ((await operate({ type: "delete_page", pageId: page.id })).ok) onClose();
                }}
              >
                {t("delete")}
              </button>
            </DialogActions>
          </ModalDialog>
        )}
      </aside>
    </div>,
    document.body
  );
}
