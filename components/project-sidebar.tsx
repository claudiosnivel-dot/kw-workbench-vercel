"use client";

import Link from "next/link";
import { useTranslations } from "next-intl";
import { usePathname, useRouter } from "next/navigation";
import { type ReactNode, useState } from "react";
import { EntityMenu, type EntityMenuItem } from "@/components/entity-menu";
import { sendJson } from "@/lib/client/http";
import { planHref, type ProjectProgressData, type StepStatus, type TopicProgress } from "@/lib/modules/next-step";
import { keywordsHref } from "@/lib/modules/results-view";

type ProjectSidebarProps = {
  projectId: string;
  progress: Pick<ProjectProgressData, "steps" | "topics" | "keptCount" | "latestStrategy">;
  /** section.write nel workspace (D-08): riordino degli argomenti; la rotta resta protetta lato server (T-1502). */
  canReorder: boolean;
  onAddTopic: () => void;
};

type CurrentItem = { kind: "keywords" } | { kind: "topic"; id: string } | { kind: "plan" } | { kind: "settings" } | null;

/** Voce della barra laterale corrispondente alla pagina aperta: la vista sta nel percorso (T-2403). */
function useCurrentItem(projectId: string): CurrentItem {
  const pathname = usePathname();
  const base = `/projects/${projectId}`;

  if (pathname === `${base}/keywords`) {
    return { kind: "keywords" };
  }
  if (pathname.startsWith(`${base}/keywords/`)) {
    return { kind: "topic", id: pathname.slice(`${base}/keywords/`.length).split("/")[0] };
  }
  if (pathname.startsWith(`${base}/plan`) || pathname.startsWith(`${base}/strategy`)) {
    return { kind: "plan" };
  }
  if (pathname === `${base}/settings`) {
    return { kind: "settings" };
  }
  return null;
}

/** Tappa numerata: ✓ con il testo nascosto «fatto», altrimenti il numero con «da fare». */
export function StepMarker({ number, status }: { number: number; status: StepStatus }) {
  const t = useTranslations("project.shell.status");
  return (
    <span className={`project-step-marker is-${status}`}>
      <span aria-hidden="true">{status === "done" ? "✓" : number}</span>
      <span className="sr-only">{status === "done" ? t("done") : t("todo")}</span>
    </span>
  );
}

function SidebarLink({ href, current, className, children }: { href: string; current: boolean; className: string; children: ReactNode }) {
  return (
    <Link href={href} aria-current={current ? "page" : undefined} className={`${className} ${current ? "is-current" : ""}`}>
      {children}
    </Link>
  );
}

type StepLinkProps = {
  href: string;
  current: boolean;
  number: number;
  status: StepStatus;
  title: string;
  detail: string;
  detailTestId?: string;
};

/** Tappa del percorso con il titolo e una riga di dettaglio (Piano dei contenuti, Scrittura). */
function StepLink({ href, current, number, status, title, detail, detailTestId }: StepLinkProps) {
  return (
    <SidebarLink href={href} current={current} className="project-step">
      <StepMarker number={number} status={status} />
      <span className="min-w-0 flex-1">
        <span className="block font-semibold">{title}</span>
        <span className="block text-xs text-slate-500" data-testid={detailTestId}>
          {detail}
        </span>
      </span>
    </SidebarLink>
  );
}

type TopicListProps = {
  projectId: string;
  topics: TopicProgress[];
  currentId: string | null;
  canReorder: boolean;
  onAddTopic: () => void;
};

/**
 * Argomenti della tappa 1 in ordine di position e «Nuovo argomento» (T-2303). Con section.write si riordinano
 * trascinandoli (drag and drop nativo) o con «Sposta su» e «Sposta giù» del loro menu ⋯, l'alternativa da tastiera e
 * touch (T-2603): entrambi chiamano la rotta di riordino esistente (T-808) un posto alla volta, poi la pagina si
 * aggiorna. Finché non arriva l'ordine salvato si mostra quello appena scelto.
 */
function TopicList({ projectId, topics, currentId, canReorder, onAddTopic }: TopicListProps) {
  const t = useTranslations("project.shell");
  const router = useRouter();
  const [local, setLocal] = useState<{ base: TopicProgress[]; order: TopicProgress[] } | null>(null);
  const [dragged, setDragged] = useState<number | null>(null);
  const [pending, setPending] = useState(false);
  const [failed, setFailed] = useState(false);
  const shown = local && local.base === topics ? local.order : topics;

  const move = async (from: number, to: number) => {
    if (pending || to === from || to < 0 || to >= shown.length) return;
    const topic = shown[from];
    const order = shown.filter((item) => item.id !== topic.id);
    order.splice(to, 0, topic);
    setLocal({ base: topics, order });
    setPending(true);
    setFailed(false);
    try {
      for (let step = 0; step < Math.abs(to - from); step += 1) {
        const body = { subprojectId: topic.id, direction: to < from ? "up" : "down" };
        const response = await sendJson("PATCH", `/api/projects/${projectId}/subprojects/reorder`, body);
        if (!response.ok) throw new Error(String(response.status));
      }
    } catch {
      setLocal(null);
      setFailed(true);
    } finally {
      setPending(false);
      router.refresh();
    }
  };

  const menuItems = (index: number): EntityMenuItem[] => [
    ...(index > 0 ? [{ kind: "action" as const, label: t("moveUp"), onSelect: () => void move(index, index - 1) }] : []),
    ...(index < shown.length - 1 ? [{ kind: "action" as const, label: t("moveDown"), onSelect: () => void move(index, index + 1) }] : []),
  ];

  return (
    <>
      <ul className="project-topics">
        {shown.map((topic, index) => (
          <li
            key={topic.id}
            className={`project-topic-row ${dragged === index ? "is-dragging" : ""}`}
            draggable={canReorder && !pending}
            onDragStart={(event) => {
              event.dataTransfer.effectAllowed = "move";
              setDragged(index);
            }}
            onDragOver={(event) => {
              if (dragged !== null) event.preventDefault();
            }}
            onDrop={(event) => {
              event.preventDefault();
              if (dragged !== null) void move(dragged, index);
              setDragged(null);
            }}
            onDragEnd={() => setDragged(null)}
          >
            <SidebarLink href={keywordsHref(projectId, { subprojectId: topic.id })} current={currentId === topic.id} className="project-topic">
              <span className="min-w-0 flex-1 truncate">{topic.name}</span>
              <span className="text-xs text-slate-500">{topic.keptCount}</span>
            </SidebarLink>
            {canReorder && shown.length > 1 && (
              <span className="project-topic-menu">
                <EntityMenu label={t("topicMenu", { name: topic.name })} items={menuItems(index)} />
              </span>
            )}
          </li>
        ))}
        <li>
          <button type="button" className="project-topic project-topic-add" onClick={onAddTopic}>
            <span aria-hidden="true">+</span> {t("addTopic")}
          </button>
        </li>
      </ul>
      {failed && (
        <p className="px-2 text-xs text-red-700" role="alert">
          {t("moveFailed")}
        </p>
      )}
    </>
  );
}

/**
 * Barra laterale del progetto (T-2303, struttura «M1» di D-39): fa da navigazione e da guida. Tappa 1 Keyword con gli
 * argomenti riordinabili (T-2603) e «Nuovo argomento», tappa 2 Piano dei contenuti, tappa 3 Scrittura con le pagine
 * pubblicate (T-2506, porta al piano raggruppato per stato), poi le Impostazioni; ogni tappa mostra il suo stato e la
 * voce della pagina aperta ha aria-current=page. I nomi degli argomenti sono resi come testo.
 */
export function ProjectSidebar({ projectId, progress, canReorder, onAddTopic }: ProjectSidebarProps) {
  const t = useTranslations("project.shell");
  const current = useCurrentItem(projectId);
  const { steps, topics, keptCount, latestStrategy } = progress;

  return (
    <nav aria-label={t("label")} className="project-sidebar">
      <SidebarLink href={keywordsHref(projectId, { view: "all" })} current={current?.kind === "keywords"} className="project-step">
        <StepMarker number={1} status={steps.keywords} />
        <span className="min-w-0 flex-1 font-semibold">{t("keywords")}</span>
        <span className="text-xs text-slate-500">{t("keptCount", { count: keptCount })}</span>
      </SidebarLink>

      <TopicList
        projectId={projectId}
        topics={topics}
        currentId={current?.kind === "topic" ? current.id : null}
        canReorder={canReorder}
        onAddTopic={onAddTopic}
      />

      <StepLink
        href={planHref(projectId)}
        current={current?.kind === "plan"}
        number={2}
        status={steps.plan}
        title={t("plan")}
        detail={latestStrategy ? t("planPages", { count: latestStrategy.pageCount }) : t("planToCreate")}
      />
      <StepLink
        href={planHref(projectId, { group: "status" })}
        current={false}
        number={3}
        status={steps.writing}
        title={t("writing")}
        detail={
          latestStrategy && latestStrategy.pageCount > 0
            ? t("writingProgress", { published: latestStrategy.publishedCount, total: latestStrategy.pageCount })
            : t("writingToStart")
        }
        detailTestId="sidebar-writing"
      />

      <div className="project-sidebar-separator" role="presentation" />
      <SidebarLink href={`/projects/${projectId}/settings`} current={current?.kind === "settings"} className="project-topic">
        {t("settings")}
      </SidebarLink>
    </nav>
  );
}
