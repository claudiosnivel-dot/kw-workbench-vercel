"use client";

import { useTranslations } from "next-intl";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { type ReactNode, useId, useState, useTransition } from "react";
import { useRegisterExportView } from "@/components/export-view-context";
import { KeywordTable } from "@/components/keywords/keyword-table";
import { KeywordToolbar } from "@/components/keywords/keyword-toolbar";
import { PaginationLinks } from "@/components/pagination-links";
import { messageOf, readApiResponse, sendJson } from "@/lib/client/http";
import { useStoredColumns } from "@/lib/client/use-stored-columns";
import type { KeywordChip, KeywordRowData, KeywordSort } from "@/lib/modules/keywords-options";

type Paging = { page: number; totalPages: number; start: number; end: number; total: number };

type KeywordsBoardProps = {
  projectId: string;
  /** Argomento della pagina; null nella vista del progetto, che mostra la colonna Argomento. */
  topic: { id: string; name: string } | null;
  kept: KeywordRowData[];
  discarded: KeywordRowData[];
  /** found: keyword del perimetro; keptTotal: tenute senza filtri; keptFiltered e discardedFiltered: la vista. */
  counts: { found: number; keptTotal: number; keptFiltered: number; discardedFiltered: number };
  keptPaging: Paging;
  discardedPaging: Paging;
  chipCounts: Record<"all" | KeywordChip, number>;
  sort: KeywordSort;
  /** Filtri attivi della vista (chip, cerca, Filtri): azioni sul set filtrato ed export «Solo quelle che vedi ora». */
  filterParams: Record<string, string>;
  /** «Trova altre keyword» e menu ⋯ dell'argomento. */
  actions?: ReactNode;
  /** Riquadri sopra l'elenco: ricerca in corso, «Aggiungi i volumi». */
  notices?: ReactNode;
  /** Ricerca in corso sull'argomento: un elenco ancora vuoto non mostra l'invito ad avviarla. */
  searching?: boolean;
};

type Lists = { kept: KeywordRowData[]; discarded: KeywordRowData[]; keptDelta: number };

function pageHref(pathname: string, params: URLSearchParams, key: string, page: number): string {
  const next = new URLSearchParams(params);
  next.set(key, String(page));
  return `${pathname}?${next.toString()}`;
}

/**
 * Pagina delle keyword di un argomento o del progetto (T-2403): intestazione con «N trovate · M tenute», strumenti,
 * elenco delle tenute con un clic per scartare e, in fondo, le scartate a richiesta con il pulsante Tieni. Il clic
 * aggiorna subito la riga e i conteggi; se la PATCH fallisce la riga torna al suo posto con un messaggio. Con un filtro
 * attivo, «Tieni queste N» e «Scarta queste N» agiscono su tutto il set filtrato (T-803).
 */
export function KeywordsBoard(props: KeywordsBoardProps) {
  const { projectId, topic, counts, keptPaging, discardedPaging, filterParams } = props;
  const t = useTranslations("keywords");
  const tErrors = useTranslations("errors");
  const tCommon = useTranslations("common");
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const discardedId = useId();
  const [columns, setColumn] = useStoredColumns();
  const [showDiscarded, setShowDiscarded] = useState(searchParams.has("discardedPage"));
  const [pendingIds, setPendingIds] = useState<Set<string>>(new Set());
  const [error, setError] = useState<string | null>(null);
  const [bulkPending, startBulk] = useTransition();

  // Elenchi locali: ripartono dai dati del server a ogni nuova resa (dopo router.refresh).
  const [source, setSource] = useState({ kept: props.kept, discarded: props.discarded });
  const [lists, setLists] = useState<Lists>({ kept: props.kept, discarded: props.discarded, keptDelta: 0 });
  if (source.kept !== props.kept || source.discarded !== props.discarded) {
    setSource({ kept: props.kept, discarded: props.discarded });
    setLists({ kept: props.kept, discarded: props.discarded, keptDelta: 0 });
  }

  const filtered = Object.keys(filterParams).length > 0;
  const keptFiltered = counts.keptFiltered + lists.keptDelta;
  const discardedFiltered = counts.discardedFiltered - lists.keptDelta;
  useRegisterExportView(filtered ? { keywords: { count: keptFiltered, filters: { ...filterParams, status: "kept" } } } : null);

  const patch = (body: Record<string, unknown>) =>
    sendJson("PATCH", `/api/projects/${projectId}/results`, { ...body, subprojectId: topic?.id }).then((response) =>
      readApiResponse(response, tErrors)
    );

  const move = (row: KeywordRowData, discard: boolean, before?: Lists) =>
    setLists((current) => {
      if (before) return before;
      const moved = { ...row, discarded: discard };
      const without = (list: KeywordRowData[]) => list.filter((item) => item.id !== row.id);
      return discard
        ? { kept: without(current.kept), discarded: [moved, ...without(current.discarded)], keptDelta: current.keptDelta - 1 }
        : { kept: [moved, ...without(current.kept)], discarded: without(current.discarded), keptDelta: current.keptDelta + 1 };
    });

  const toggle = async (row: KeywordRowData) => {
    const discard = !row.discarded;
    const before = lists;
    setError(null);
    setPendingIds((ids) => new Set(ids).add(row.id));
    move(row, discard);
    try {
      await patch({ action: discard ? "discard" : "keep", ids: [row.id] });
      router.refresh();
    } catch (toggleError) {
      // La riga torna dove era, con i conteggi di prima.
      move(row, !discard, before);
      setError(t("saveFailed", { reason: messageOf(toggleError, tCommon("unexpectedError")) }));
    } finally {
      setPendingIds((ids) => {
        const next = new Set(ids);
        next.delete(row.id);
        return next;
      });
    }
  };

  const bulk = (action: "keep" | "discard") =>
    startBulk(async () => {
      setError(null);
      try {
        await patch({ action, filters: { ...filterParams, status: action === "discard" ? "kept" : "discarded" } });
        router.refresh();
      } catch (bulkError) {
        setError(t("saveFailed", { reason: messageOf(bulkError, tCommon("unexpectedError")) }));
      }
    });

  const params = new URLSearchParams(searchParams.toString());
  const pager = (paging: Paging, key: string) => (
    <div className="flex flex-col gap-2 text-sm sm:flex-row sm:items-center sm:justify-between">
      <p className="text-slate-600">{t("rows", { start: paging.start, end: paging.end, total: paging.total })}</p>
      <PaginationLinks
        previousHref={paging.page > 1 ? pageHref(pathname, params, key, paging.page - 1) : null}
        nextHref={paging.page < paging.totalPages ? pageHref(pathname, params, key, paging.page + 1) : null}
      />
    </div>
  );

  return (
    <section className="card space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <h1 className="truncate text-2xl font-semibold">{topic ? topic.name : t("projectTitle")}</h1>
          <p className="text-sm text-slate-600">{t("counts", { found: counts.found, kept: counts.keptTotal + lists.keptDelta })}</p>
        </div>
        {props.actions}
      </div>

      {props.notices}

      <KeywordToolbar chipCounts={props.chipCounts} sort={props.sort} columns={columns} onColumnChange={setColumn} />

      {filtered && (keptFiltered > 0 || discardedFiltered > 0) && (
        <div className="flex flex-wrap gap-2">
          {keptFiltered > 0 && (
            <button type="button" className="btn-secondary" disabled={bulkPending} onClick={() => bulk("discard")}>
              {t("bulk.discard", { count: keptFiltered })}
            </button>
          )}
          {discardedFiltered > 0 && (
            <button type="button" className="btn-secondary" disabled={bulkPending} onClick={() => bulk("keep")}>
              {t("bulk.keep", { count: discardedFiltered })}
            </button>
          )}
        </div>
      )}

      {error && (
        <p className="text-sm text-red-700" role="alert">
          {error}
        </p>
      )}

      {lists.kept.length > 0 ? (
        <KeywordTable
          label={t("table.label")}
          rows={lists.kept}
          showTopic={!topic}
          columns={columns}
          pendingIds={pendingIds}
          onToggle={toggle}
        />
      ) : (
        !props.searching && (
          <p className="text-sm text-slate-600">{t(filtered ? "empty.filtered" : topic ? "empty.topic" : "empty.project")}</p>
        )
      )}
      {keptPaging.totalPages > 1 && pager(keptPaging, "page")}

      <div className="space-y-3 border-t border-[var(--surface-border)] pt-3">
        <button
          type="button"
          className="btn-secondary"
          aria-expanded={showDiscarded}
          aria-controls={showDiscarded ? discardedId : undefined}
          onClick={() => setShowDiscarded((shown) => !shown)}
        >
          {t("discarded.toggle", { count: discardedFiltered })}
        </button>
        {showDiscarded && (
          <div id={discardedId} className="space-y-3">
            <p className="text-sm text-slate-600">{t("discarded.hint")}</p>
            {lists.discarded.length > 0 ? (
              <KeywordTable
                label={t("table.discardedLabel")}
                rows={lists.discarded}
                showTopic={!topic}
                columns={columns}
                pendingIds={pendingIds}
                onToggle={toggle}
              />
            ) : (
              <p className="text-sm text-slate-600">{t("empty.discarded")}</p>
            )}
            {discardedPaging.totalPages > 1 && pager(discardedPaging, "discardedPage")}
          </div>
        )}
      </div>
    </section>
  );
}
