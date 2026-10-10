"use client";

import { type FormEvent, useState } from "react";
import { useTranslations } from "next-intl";
import { KeywordMover, type MoveDestination } from "@/components/strategy/keyword-mover";
import { FormFeedback } from "@/components/form-feedback";
import { useStrategyOperations } from "@/lib/client/use-strategy-action";
import { STRATEGY_CONTENT_TYPES, type StrategyContentType, type StrategyPageView } from "@/lib/modules/strategy/types";

type StrategyPageCardProps = {
  projectId: string;
  strategyId: string;
  version: number;
  page: StrategyPageView;
  /** H1 delle pagine collegate: lo spoke verso il proprio hub, l'hub verso i propri spoke. */
  links: string[];
  /** Le altre pagine del piano, destinazioni di spostamenti e unioni. */
  destinations: MoveDestination[];
};

/**
 * Scheda di una pagina del piano (T-1905): H1 e H2 (con l'etichetta «suggerito» finché l'utente non li riscrive),
 * keyword, motivo tradotto, link interni previsti e controlli di modifica. I testi del piano sono resi come testo da
 * React, mai come HTML (CWE-79).
 */
export function StrategyPageCard({ projectId, strategyId, version, page, links, destinations }: StrategyPageCardProps) {
  const t = useTranslations("strategy");
  const { pending, error, operate, patchPage } = useStrategyOperations(projectId, strategyId, version);
  const [editing, setEditing] = useState(false);
  const [h1, setH1] = useState(page.h1);
  const [h2, setH2] = useState(page.h2.join("\n"));
  const [contentType, setContentType] = useState<StrategyContentType>(page.contentType);
  const [mergeTarget, setMergeTarget] = useState("");
  const [confirmDelete, setConfirmDelete] = useState(false);

  const headingId = `strategy-page-${page.id}`;
  const params = page.reason.params;
  const merged = Number(params.merged ?? 0);
  const faq = Number(params.faq ?? 0);

  const saveTitles = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const patch: Record<string, unknown> = {};
    if (h1.trim() !== page.h1) patch.h1 = h1.trim();
    const lines = h2.split("\n").map((line) => line.trim()).filter(Boolean);
    if (lines.join("\n") !== page.h2.join("\n")) patch.h2 = lines;
    if (contentType !== page.contentType) patch.contentType = contentType;
    if (Object.keys(patch).length === 0 || (await patchPage(page.id, patch))) setEditing(false);
  };

  return (
    <article className="card space-y-4" aria-labelledby={headingId}>
      <div className="flex flex-wrap items-center gap-2 text-xs">
        <span className="status-chip">{t(`ui.kind.${page.kind}`)}</span>
        <span className="status-chip">{t(`ui.contentTypes.${page.contentType}`)}</span>
        <span className="text-slate-500">{t("ui.priority", { value: page.priority })}</span>
      </div>

      <div className="flex flex-wrap items-baseline gap-2" data-testid="strategy-page-h1">
        <h3 id={headingId} className="text-lg font-semibold">
          {page.h1}
        </h3>
        {!page.h1Edited && <span className="status-chip">{t("ui.suggested")}</span>}
      </div>

      <div className="space-y-1">
        <p className="text-sm font-medium">
          {t("ui.h2Title")}
          {!page.h2Edited && page.h2.length > 0 && <span className="status-chip ml-2">{t("ui.suggested")}</span>}
        </p>
        {page.h2.length > 0 ? (
          <ol className="list-decimal space-y-0.5 pl-5 text-sm">
            {page.h2.map((heading, index) => (
              <li key={`${index}-${heading}`}>{heading}</li>
            ))}
          </ol>
        ) : (
          <p className="text-sm text-slate-500">{t("ui.noH2")}</p>
        )}
      </div>

      <div className="space-y-1 text-sm">
        <p className="font-medium">{t("ui.reasonTitle")}</p>
        <p className="text-slate-600">{t(`reasons.${page.reason.code}` as "reasons.HUB_SEED", params as never)}</p>
        {merged > 0 && <p className="text-slate-600">{t("reasons.MERGED_INTO_PILLAR", { count: merged })}</p>}
        {faq > 0 && <p className="text-slate-600">{t("ui.faqCount", { count: faq })}</p>}
      </div>

      <div className="space-y-1 text-sm">
        <p className="font-medium">{t("ui.linksTitle")}</p>
        {links.length > 0 ? (
          <ul className="list-disc pl-5">
            {links.map((link, index) => (
              <li key={`${index}-${link}`}>{link}</li>
            ))}
          </ul>
        ) : (
          <p className="text-slate-500">{t("ui.noLinks")}</p>
        )}
      </div>

      <div className="space-y-2">
        <p className="text-sm font-medium">{t("ui.keywordsTitle")}</p>
        <KeywordMover
          keywords={page.keywords}
          destinations={destinations}
          allowUnassigned
          pending={pending}
          onMove={(keywordIds, targetPageId) => operate({ type: "move_keywords", keywordIds, targetPageId })}
        />
      </div>

      {editing ? (
        <form className="space-y-3" onSubmit={saveTitles}>
          <label className="block">
            <span className="label">{t("ui.h1Field")}</span>
            <input className="input" value={h1} maxLength={200} required onChange={(event) => setH1(event.target.value)} />
          </label>
          <label className="block">
            <span className="label">{t("ui.h2Field")}</span>
            <textarea className="input min-h-32" value={h2} onChange={(event) => setH2(event.target.value)} />
          </label>
          <label className="block">
            <span className="label">{t("ui.contentTypeField")}</span>
            <select className="select" value={contentType} onChange={(event) => setContentType(event.target.value as StrategyContentType)}>
              {STRATEGY_CONTENT_TYPES.map((type) => (
                <option key={type} value={type}>
                  {t(`ui.contentTypes.${type}`)}
                </option>
              ))}
            </select>
          </label>
          <div className="flex flex-wrap gap-2">
            <button className="btn-primary" type="submit" disabled={pending}>
              {pending ? t("ui.working") : t("ui.save")}
            </button>
            <button className="btn-secondary" type="button" onClick={() => setEditing(false)}>
              {t("ui.cancel")}
            </button>
          </div>
        </form>
      ) : (
        <div className="flex flex-wrap items-end gap-2">
          <button className="btn-secondary" type="button" onClick={() => setEditing(true)}>
            {t("ui.editTitles")}
          </button>
          {page.kind === "SPOKE" && (
            <button
              className="btn-secondary"
              type="button"
              disabled={pending}
              onClick={() => void operate({ type: "promote_to_hub", pageId: page.id })}
            >
              {t("ui.promote")}
            </button>
          )}
          <label className="block">
            <span className="label">{t("ui.mergeInto")}</span>
            <select className="select" value={mergeTarget} onChange={(event) => setMergeTarget(event.target.value)}>
              <option value="" disabled>
                {t("ui.mergeInto")}
              </option>
              {destinations.map((destination) => (
                <option key={destination.id} value={destination.id}>
                  {destination.label}
                </option>
              ))}
            </select>
          </label>
          <button
            className="btn-secondary"
            type="button"
            disabled={pending || !mergeTarget}
            onClick={() => void operate({ type: "merge_pages", sourcePageId: page.id, targetPageId: mergeTarget })}
          >
            {t("ui.merge")}
          </button>
          {confirmDelete ? (
            <>
              <button
                className="btn-danger"
                type="button"
                disabled={pending}
                onClick={() => void operate({ type: "delete_page", pageId: page.id })}
              >
                {t("ui.confirmDeletePage")}
              </button>
              <button className="btn-secondary" type="button" onClick={() => setConfirmDelete(false)}>
                {t("ui.cancel")}
              </button>
              <p className="w-full text-xs text-slate-500">{t("ui.deletePageHint")}</p>
            </>
          ) : (
            <button className="btn-danger" type="button" onClick={() => setConfirmDelete(true)}>
              {t("ui.deletePage")}
            </button>
          )}
        </div>
      )}

      <FormFeedback error={error} />
    </article>
  );
}
