"use client";

import Link from "next/link";
import { useFormatter, useTranslations } from "next-intl";
import { type DragEvent, type ReactNode, useId, useMemo, useState } from "react";
import { EntityMenu } from "@/components/entity-menu";
import { PagePanel } from "@/components/plan/page-panel";
import { type PickGroup, PickDialog } from "@/components/plan/pick-dialog";
import { PlanProgress, type StatusCounts } from "@/components/plan/plan-progress";
import { PlanRequestsProvider, usePlanRequests } from "@/components/plan/plan-requests";
import { StatusMenu } from "@/components/plan/status-menu";
import { useMenuButton } from "@/lib/client/use-menu-button";
import { type PlanGroup, type PlanView, planHref } from "@/lib/modules/next-step";
import {
  STRATEGY_PAGE_STATUSES,
  type StrategyKeywordView,
  type StrategyPageStatus,
  type StrategyPageView,
  type StrategyView,
} from "@/lib/modules/strategy/types";

// Colori delle etichette delle pagine principali con Raggruppa per Stato, assegnati in ordine agli hub.
const HUB_COLORS = 8;
// Tipo dei dati trascinati: solo id interni, verificati dal server (CWE-639).
const DRAG_TYPE = "application/x-titan-plan";

type DragItem = { type: "page" | "keyword"; id: string };
type DropTarget = { kind: "hub"; hubId: string } | { kind: "status"; status: StrategyPageStatus } | { kind: "card"; pageId: string };

export type PlanBoardProps = {
  projectId: string;
  strategy: StrategyView;
  group: PlanGroup;
  /** Vista scelta nell'URL; null: bacheca da 640 px in su, elenco sotto. */
  view: PlanView | null;
  /** Versione precedente: solo l'elenco, senza modifiche. */
  readOnly: boolean;
  /** «Migliora i titoli con l'AI» nel pannello della pagina (T-3603): funzione accesa, chiave e permesso di modifica. */
  aiTitlesAvailable: boolean;
  /** Articoli nel pannello della pagina (T-4401): avvio disponibile e pagine che hanno già un articolo; assente nelle versioni precedenti. */
  articles?: { available: boolean; pageIds: string[] };
  /** Pagina il cui pannello è aperto all'arrivo (parametro page, T-2506). */
  openPageId: string | null;
};

type HubModel = { pillar: StrategyPageView; spokes: StrategyPageView[]; label: string; color: number };

/** Piano nell'ordine di lavoro con il numero di ogni pagina, la sua pagina principale e i conteggi per stato. */
function planModel(strategy: StrategyView) {
  const hubs: HubModel[] = strategy.hubs.map((hub, index) => ({
    ...hub,
    label: hub.pillar.keywords.find((keyword) => keyword.role === "MAIN")?.keyword ?? hub.pillar.h1,
    color: index % HUB_COLORS,
  }));
  const pages = hubs.flatMap((hub) => [hub.pillar, ...hub.spokes]);
  const number = new Map(pages.map((page, index) => [page.id, index + 1]));
  const hubOf = new Map(hubs.flatMap((hub) => [hub.pillar, ...hub.spokes].map((page) => [page.id, hub] as const)));
  const counts: StatusCounts = {
    todo: pages.filter((page) => page.status === "TODO").length,
    writing: pages.filter((page) => page.status === "WRITING").length,
    published: pages.filter((page) => page.status === "PUBLISHED").length,
  };
  const destinations: PickGroup[] = hubs.map((hub) => ({
    label: hub.label,
    options: [hub.pillar, ...hub.spokes].map((page) => ({ id: page.id, label: `${number.get(page.id)}. ${page.h1}` })),
  }));
  return { hubs, pages, number, hubOf, counts, destinations };
}

type PlanModel = ReturnType<typeof planModel>;

function keywordsSummary(page: StrategyPageView) {
  const volumes = page.keywords.map((keyword) => keyword.volume).filter((volume): volume is number => volume !== null);
  return { count: page.keywords.length, volume: volumes.length > 0 ? volumes.reduce((sum, volume) => sum + volume, 0) : null };
}

function readDrag(event: DragEvent): DragItem | null {
  try {
    const value = JSON.parse(event.dataTransfer.getData(DRAG_TYPE)) as Partial<DragItem>;
    return (value.type === "page" || value.type === "keyword") && typeof value.id === "string" ? { type: value.type, id: value.id } : null;
  } catch {
    return null;
  }
}

/**
 * Piano dei contenuti (T-2504): avanzamento della scrittura, selettori Raggruppa per e vista nell'URL, bacheca o elenco
 * e pannello di dettaglio (T-2505). Le modifiche passano tutte dalle API del piano con la version (PlanRequestsProvider).
 */
export function PlanBoard(props: PlanBoardProps) {
  return (
    <PlanRequestsProvider projectId={props.projectId} strategyId={props.strategy.id} version={props.strategy.version}>
      <PlanBoardContent {...props} />
    </PlanRequestsProvider>
  );
}

type SegmentedProps<T extends string> = {
  label: string;
  options: { value: T; label: string }[];
  current: T;
  href: (value: T) => string;
  className?: string;
};

function Segmented<T extends string>({ label, options, current, href, className = "flex" }: SegmentedProps<T>) {
  return (
    <div className={`${className} items-center gap-2 text-sm`}>
      <span className="text-slate-600">{label}</span>
      <div role="group" aria-label={label} className="plan-segmented">
        {options.map((option) => (
          <Link key={option.value} href={href(option.value)} aria-current={option.value === current ? "true" : undefined} scroll={false}>
            {option.label}
          </Link>
        ))}
      </div>
    </div>
  );
}

function Column({ title, count, target, testId, children }: { title: string; count: string; target: ColumnTarget; testId: string; children: ReactNode }) {
  const headingId = useId();
  return (
    <section aria-labelledby={headingId} className={`plan-column ${target.active ? "is-drop-target" : ""}`} data-testid={testId} {...target.props}>
      <header className="flex items-baseline justify-between gap-2">
        <h2 id={headingId} className="min-w-0 truncate text-sm font-semibold">
          {title}
        </h2>
        <span className="shrink-0 text-xs text-slate-500">{count}</span>
      </header>
      {children}
    </section>
  );
}

type ColumnTarget = { active: boolean; props: Record<string, unknown> };

function PlanBoardContent({ projectId, strategy, group, view, readOnly, aiTitlesAvailable, articles, openPageId }: PlanBoardProps) {
  const t = useTranslations("plan");
  const requests = usePlanRequests();
  const model = useMemo(() => planModel(strategy), [strategy]);
  const [openId, setOpenId] = useState(openPageId);
  const [dragging, setDragging] = useState<DragItem | null>(null);
  const [over, setOver] = useState<string | null>(null);
  const [pick, setPick] = useState<{ kind: "move"; page: StrategyPageView } | { kind: "assign"; keyword: StrategyKeywordView } | null>(null);

  const pageById = (id: string) => model.pages.find((page) => page.id === id);
  const openPage = openId ? pageById(openId) : undefined;

  const closePanel = () => {
    setOpenId(null);
    const params = new URLSearchParams(window.location.search);
    if (params.has("page")) {
      params.delete("page");
      const search = params.toString();
      window.history.replaceState(null, "", `${window.location.pathname}${search ? `?${search}` : ""}`);
    }
  };

  const accepts = (item: DragItem | null, target: DropTarget): boolean => {
    if (!item || readOnly) return false;
    if (target.kind === "card") return item.type === "keyword";
    const page = item.type === "page" ? pageById(item.id) : undefined;
    if (!page) return false;
    return target.kind === "hub" ? page.kind === "SPOKE" && page.hubPageId !== target.hubId : page.status !== target.status;
  };

  const drop = (item: DragItem, target: DropTarget) => {
    if (target.kind === "hub") void requests.operate({ type: "move_page", pageId: item.id, targetHubId: target.hubId });
    else if (target.kind === "status") void requests.patchPage(item.id, { status: target.status });
    else void requests.operate({ type: "move_keywords", keywordIds: [item.id], targetPageId: target.pageId });
  };

  const targetKey = (target: DropTarget) =>
    target.kind === "hub" ? `hub:${target.hubId}` : target.kind === "status" ? `status:${target.status}` : `card:${target.pageId}`;

  const dropTarget = (target: DropTarget): ColumnTarget => {
    const key = targetKey(target);
    if (readOnly) return { active: false, props: {} };
    return {
      active: over === key,
      props: {
        onDragOver: (event: DragEvent) => {
          if (!accepts(dragging, target)) return;
          event.preventDefault();
          event.stopPropagation();
          event.dataTransfer.dropEffect = "move";
          setOver(key);
        },
        onDragLeave: (event: DragEvent<HTMLElement>) => {
          if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setOver((current) => (current === key ? null : current));
        },
        onDrop: (event: DragEvent) => {
          const item = readDrag(event) ?? dragging;
          if (!accepts(item, target)) return;
          event.preventDefault();
          event.stopPropagation();
          setOver(null);
          setDragging(null);
          drop(item!, target);
        },
      },
    };
  };

  const dragSource = (item: DragItem) =>
    readOnly
      ? {}
      : {
          draggable: true,
          onDragStart: (event: DragEvent) => {
            event.dataTransfer.setData(DRAG_TYPE, JSON.stringify(item));
            event.dataTransfer.effectAllowed = "move";
            setDragging(item);
          },
          onDragEnd: () => {
            setDragging(null);
            setOver(null);
          },
        };

  const card = (page: StrategyPageView, showHubTag: boolean) => {
    const hub = model.hubOf.get(page.id)!;
    const otherHubs = model.hubs.filter((item) => item.pillar.id !== hub.pillar.id);
    const canMove = !readOnly && page.kind === "SPOKE" && otherHubs.length > 0;
    return (
      <PlanCard
        key={page.id}
        page={page}
        number={model.number.get(page.id)!}
        hub={hub}
        showHubTag={showHubTag}
        readOnly={readOnly}
        drag={canMove || group === "status" ? dragSource({ type: "page", id: page.id }) : {}}
        target={dropTarget({ kind: "card", pageId: page.id })}
        onOpen={() => setOpenId(page.id)}
        onStatus={(status) => void requests.patchPage(page.id, { status })}
        onMoveUnder={canMove ? () => setPick({ kind: "move", page }) : null}
      />
    );
  };

  const hubBoard = (
    <>
      {model.hubs.map((hub) => (
        <Column
          key={hub.pillar.id}
          title={hub.label}
          count={t("column.pages", { count: 1 + hub.spokes.length })}
          target={dropTarget({ kind: "hub", hubId: hub.pillar.id })}
          testId="plan-column"
        >
          <ol className="plan-cards">{[hub.pillar, ...hub.spokes].map((page) => card(page, false))}</ol>
        </Column>
      ))}
      {strategy.unassigned.length > 0 && (
        <Column
          title={t("column.unassigned")}
          count={String(strategy.unassigned.length)}
          target={{ active: false, props: {} }}
          testId="plan-column-unassigned"
        >
          {!readOnly && <p className="text-xs text-slate-500">{t("column.unassignedHint")}</p>}
          <ul className="flex flex-wrap gap-1.5">
            {strategy.unassigned.map((keyword) => (
              <li key={keyword.id}>
                <KeywordChip
                  keyword={keyword}
                  readOnly={readOnly}
                  drag={dragSource({ type: "keyword", id: keyword.id })}
                  onAssign={() => setPick({ kind: "assign", keyword })}
                />
              </li>
            ))}
          </ul>
        </Column>
      )}
    </>
  );

  const statusBoard = STRATEGY_PAGE_STATUSES.map((status) => {
    const pages = model.pages.filter((page) => page.status === status);
    return (
      <Column
        key={status}
        title={t(`statusColumns.${status}`)}
        count={t("column.pages", { count: pages.length })}
        target={dropTarget({ kind: "status", status })}
        testId="plan-column"
      >
        {pages.length > 0 ? (
          <ol className="plan-cards">{pages.map((page) => card(page, true))}</ol>
        ) : (
          <p className="text-xs text-slate-500">{t("column.empty")}</p>
        )}
      </Column>
    );
  });

  const board = (
    <div role="region" aria-label={t("boardLabel")} className="plan-board">
      {group === "status" ? statusBoard : hubBoard}
    </div>
  );
  const list = (
    <PlanList model={model} group={group} readOnly={readOnly} onOpen={setOpenId} onStatus={(id, status) => void requests.patchPage(id, { status })} />
  );

  const hub = openPage ? model.hubOf.get(openPage.id) : undefined;
  return (
    <div className="space-y-4">
      {!readOnly && (
        <>
          <PlanProgress counts={model.counts} />
          <div className="flex flex-wrap items-center gap-x-5 gap-y-2">
            <Segmented
              label={t("groupBy")}
              options={[
                { value: "hub", label: t("group.hub") },
                { value: "status", label: t("group.status") },
              ]}
              current={group}
              href={(value) => planHref(projectId, { group: value, view: view ?? undefined })}
            />
            {/* Senza vista nell'URL la bacheca vale da 640 px, l'elenco sotto: il selettore segna quella visibile. */}
            {(view ? [{ current: view, className: "flex" }] : [
              { current: "board" as const, className: "hidden sm:flex" },
              { current: "list" as const, className: "flex sm:hidden" },
            ]).map((selector) => (
              <Segmented
                key={selector.className}
                className={selector.className}
                label={t("viewLabel")}
                options={[
                  { value: "board", label: t("views.board") },
                  { value: "list", label: t("views.list") },
                ]}
                current={selector.current}
                href={(value) => planHref(projectId, { group, view: value })}
              />
            ))}
          </div>
        </>
      )}
      {requests.error && !openPage && (
        <p className="text-sm text-amber-200" role="alert">
          {requests.error}
        </p>
      )}

      {readOnly || view === "list" ? (
        list
      ) : view === "board" ? (
        board
      ) : (
        <>
          <div className="hidden sm:block">{board}</div>
          <div className="sm:hidden">{list}</div>
        </>
      )}

      {openPage && hub && (
        <PagePanel
          key={openPage.id}
          page={openPage}
          hub={openPage.id === hub.pillar.id ? null : hub.pillar}
          links={openPage.id === hub.pillar.id ? hub.spokes.map((spoke) => spoke.h1) : [hub.pillar.h1]}
          destinations={model.destinations}
          readOnly={readOnly}
          aiTitlesAvailable={aiTitlesAvailable && !readOnly}
          article={articles && !readOnly ? { available: articles.available, exists: articles.pageIds.includes(openPage.id) } : undefined}
          onClose={closePanel}
        />
      )}
      {pick?.kind === "move" && (
        <PickDialog
          labels={{ title: t("pick.moveTitle"), field: t("pick.moveLabel"), cancel: t("pick.cancel"), confirm: t("pick.confirm") }}
          groups={[
            {
              label: "",
              options: model.hubs
                .filter((item) => item.pillar.id !== pick.page.hubPageId)
                .map((item) => ({ id: item.pillar.id, label: `${model.number.get(item.pillar.id)}. ${item.pillar.h1}` })),
            },
          ]}
          onPick={(targetHubId) => requests.operate({ type: "move_page", pageId: pick.page.id, targetHubId })}
          onClose={() => setPick(null)}
        />
      )}
      {pick?.kind === "assign" && (
        <PickDialog
          labels={{
            title: t("pick.assignTitle", { keyword: pick.keyword.keyword }),
            field: t("pick.pageLabel"),
            cancel: t("pick.cancel"),
            confirm: t("pick.assign"),
          }}
          groups={model.destinations}
          onPick={(targetPageId) => requests.operate({ type: "move_keywords", keywordIds: [pick.keyword.id], targetPageId })}
          onClose={() => setPick(null)}
        />
      )}
    </div>
  );
}

type PlanCardProps = {
  page: StrategyPageView;
  number: number;
  hub: HubModel;
  showHubTag: boolean;
  readOnly: boolean;
  drag: Record<string, unknown>;
  target: ColumnTarget;
  onOpen: () => void;
  onStatus: (status: StrategyPageStatus) => void;
  onMoveUnder: (() => void) | null;
};

/**
 * Scheda di una pagina (T-2504): numero nell'ordine di lavoro, tipo, H1 (apre il pannello), keyword e ricerche, stato
 * con il suo menu; la pagina principale ha il bordo evidenziato, le pubblicate sono attenuate con la data. Il menu ⋯
 * degli approfondimenti ha «Sposta sotto…», l'alternativa al trascinamento.
 */
function PlanCard({ page, number, hub, showHubTag, readOnly, drag, target, onOpen, onStatus, onMoveUnder }: PlanCardProps) {
  const t = useTranslations("plan.card");
  const tStrategy = useTranslations("strategy.ui");
  const format = useFormatter();
  const titleId = useId();
  const pillar = page.id === hub.pillar.id;
  const summary = keywordsSummary(page);

  return (
    <li>
      <article
        aria-labelledby={titleId}
        data-testid="plan-card"
        className={`plan-card ${pillar ? "is-pillar" : ""} ${page.status === "PUBLISHED" ? "is-published" : ""} ${target.active ? "is-drop-target" : ""}`}
        {...drag}
        {...target.props}
      >
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-slate-500">
          <span>{t("number", { number })}</span>
          <span>{tStrategy(`contentTypes.${page.contentType}`)}</span>
          {pillar && <span className="status-chip">{t("pillar")}</span>}
        </div>
        {showHubTag && <span className={`plan-hub-tag is-c${hub.color}`}>{hub.label}</span>}
        <h3 id={titleId} className="leading-tight">
          <button type="button" className="plan-card-title" onClick={onOpen}>
            {page.h1}
          </button>
        </h3>
        <p className="text-xs text-slate-500">
          {summary.volume === null
            ? t("keywordsNoVolume", { count: summary.count })
            : t("keywords", { count: summary.count, volume: summary.volume })}
        </p>
        <div className="flex flex-wrap items-center gap-2">
          <StatusMenu title={page.h1} status={page.status} onChange={readOnly ? null : onStatus} />
          {page.status === "PUBLISHED" && page.statusChangedAt && (
            <span className="text-xs text-slate-500">{t("publishedOn", { date: format.dateTime(new Date(page.statusChangedAt), { dateStyle: "medium" }) })}</span>
          )}
          {onMoveUnder && (
            <span className="ml-auto">
              <EntityMenu label={t("menu", { title: page.h1 })} items={[{ kind: "action", label: t("moveUnder"), onSelect: onMoveUnder }]} />
            </span>
          )}
        </div>
      </article>
    </li>
  );
}

/** Keyword senza pagina (T-2504): si trascina su una scheda, oppure il suo menu ha «Assegna a…». */
function KeywordChip({ keyword, readOnly, drag, onAssign }: { keyword: StrategyKeywordView; readOnly: boolean; drag: Record<string, unknown>; onAssign: () => void }) {
  const t = useTranslations("plan.chip");
  const format = useFormatter();
  const { open, close, onKeyDown, wrapperRef, buttonRef, menuRef, buttonProps, menuProps } = useMenuButton();
  const volume = keyword.volume === null ? null : <span className="keyword-chip-count">{format.number(keyword.volume)}</span>;

  if (readOnly) {
    return (
      <span className="keyword-chip">
        {keyword.keyword}
        {volume}
      </span>
    );
  }
  return (
    <div ref={wrapperRef} className="relative" onKeyDown={onKeyDown}>
      <button ref={buttonRef} {...buttonProps} className="keyword-chip" {...drag}>
        {keyword.keyword}
        {volume}
      </button>
      {open && (
        <div className="user-menu-popover is-start">
          <div ref={menuRef} {...menuProps} aria-label={t("menu", { keyword: keyword.keyword })} className="grid gap-0.5">
            <button
              type="button"
              role="menuitem"
              tabIndex={-1}
              className="user-menu-item"
              onClick={() => {
                close();
                onAssign();
              }}
            >
              {t("assignTo")}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

/**
 * Vista elenco del piano (T-2504): una riga per pagina, raggruppata per pagina principale o per stato, con numero, H1
 * (apre il pannello), tipo, keyword, ricerche e stato. È anche la vista delle versioni precedenti, in sola lettura.
 */
function PlanList({
  model,
  group,
  readOnly,
  onOpen,
  onStatus,
}: {
  model: PlanModel;
  group: PlanGroup;
  readOnly: boolean;
  onOpen: (id: string) => void;
  onStatus: (id: string, status: StrategyPageStatus) => void;
}) {
  const t = useTranslations("plan");
  const tStrategy = useTranslations("strategy.ui");
  const format = useFormatter();
  const groups =
    group === "status"
      ? STRATEGY_PAGE_STATUSES.map((status) => ({ key: status, label: t(`statusColumns.${status}`), pages: model.pages.filter((page) => page.status === status) }))
      : model.hubs.map((hub) => ({ key: hub.pillar.id, label: hub.label, pages: [hub.pillar, ...hub.spokes] }));

  return (
    <div className="table-shell">
      <table className="table-enterprise min-w-[640px] text-left text-sm sm:min-w-full">
        <caption className="sr-only">{t("list.label")}</caption>
        <thead>
          <tr>
            <th className="px-3 py-2">{t("list.columns.number")}</th>
            <th className="px-3 py-2">{t("list.columns.h1")}</th>
            <th className="px-3 py-2">{t("list.columns.type")}</th>
            <th className="px-3 py-2">{t("list.columns.keywords")}</th>
            <th className="px-3 py-2">{t("list.columns.volume")}</th>
            <th className="px-3 py-2">{t("list.columns.status")}</th>
          </tr>
        </thead>
        {groups
          .filter((item) => item.pages.length > 0)
          .map((item) => (
            <tbody key={item.key}>
              <tr>
                <th colSpan={6} scope="colgroup" className="px-3 pt-4 pb-1 text-sm font-semibold">
                  {item.label}
                </th>
              </tr>
              {item.pages.map((page) => {
                const summary = keywordsSummary(page);
                return (
                  <tr key={page.id} data-testid="plan-row">
                    <td className="px-3 py-2">{model.number.get(page.id)}</td>
                    <td className="px-3 py-2">
                      <button type="button" className="plan-card-title" onClick={() => onOpen(page.id)}>
                        {page.h1}
                      </button>
                    </td>
                    <td className="px-3 py-2">{tStrategy(`contentTypes.${page.contentType}`)}</td>
                    <td className="px-3 py-2">{summary.count}</td>
                    <td className="px-3 py-2">{summary.volume === null ? "-" : format.number(summary.volume)}</td>
                    <td className="px-3 py-2">
                      <StatusMenu title={page.h1} status={page.status} onChange={readOnly ? null : (status) => onStatus(page.id, status)} />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          ))}
      </table>
    </div>
  );
}
