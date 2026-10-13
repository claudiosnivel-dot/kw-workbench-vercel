"use client";

import Link from "next/link";
import { useTranslations } from "next-intl";
import { usePathname, useSearchParams } from "next/navigation";
import type { ReactNode } from "react";
import { type ProjectProgressData, type StepStatus, strategyHref } from "@/lib/modules/next-step";
import { resultsHref } from "@/lib/modules/results-view";

type ProjectSidebarProps = {
  projectId: string;
  /** Argomento mostrato dai risultati senza parametri: quello predefinito del progetto (D-21). */
  defaultTopicId: string | null;
  progress: Pick<ProjectProgressData, "steps" | "topics" | "keptCount" | "latestStrategy">;
  onAddTopic: () => void;
};

type CurrentItem = { kind: "keywords" } | { kind: "topic"; id: string } | { kind: "plan" } | { kind: "settings" } | null;

/** Voce della barra laterale corrispondente alla pagina aperta. */
function useCurrentItem(projectId: string, defaultTopicId: string | null): CurrentItem {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const base = `/projects/${projectId}`;

  if (pathname === `${base}/results`) {
    if (searchParams.get("view") === "all") {
      return { kind: "keywords" };
    }
    const topicId = searchParams.get("subprojectId") || defaultTopicId;
    return topicId ? { kind: "topic", id: topicId } : { kind: "keywords" };
  }
  if (pathname.startsWith(`${base}/subprojects/`)) {
    return { kind: "topic", id: pathname.slice(`${base}/subprojects/`.length).split("/")[0] };
  }
  if (pathname.startsWith(`${base}/strategy`)) {
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

/**
 * Barra laterale del progetto (T-2303, struttura «M1» di D-39): fa da navigazione e da guida. Tappa 1 Keyword con gli
 * argomenti in ordine di position e «Nuovo argomento», tappa 2 Piano dei contenuti, poi le Impostazioni; ogni tappa
 * mostra il suo stato e la voce della pagina aperta ha aria-current=page. I nomi degli argomenti sono resi come testo.
 */
export function ProjectSidebar({ projectId, defaultTopicId, progress, onAddTopic }: ProjectSidebarProps) {
  const t = useTranslations("project.shell");
  const current = useCurrentItem(projectId, defaultTopicId);
  const { steps, topics, keptCount, latestStrategy } = progress;

  return (
    <nav aria-label={t("label")} className="project-sidebar">
      <SidebarLink href={resultsHref(projectId, { view: "all" })} current={current?.kind === "keywords"} className="project-step">
        <StepMarker number={1} status={steps.keywords} />
        <span className="min-w-0 flex-1 font-semibold">{t("keywords")}</span>
        <span className="text-xs text-slate-500">{t("keptCount", { count: keptCount })}</span>
      </SidebarLink>

      <ul className="project-topics">
        {topics.map((topic) => (
          <li key={topic.id}>
            <SidebarLink
              href={resultsHref(projectId, { subprojectId: topic.id })}
              current={current?.kind === "topic" && current.id === topic.id}
              className="project-topic"
            >
              <span className="min-w-0 flex-1 truncate">{topic.name}</span>
              <span className="text-xs text-slate-500">{topic.keptCount}</span>
            </SidebarLink>
          </li>
        ))}
        <li>
          <button type="button" className="project-topic project-topic-add" onClick={onAddTopic}>
            <span aria-hidden="true">+</span> {t("addTopic")}
          </button>
        </li>
      </ul>

      <SidebarLink href={strategyHref(projectId, latestStrategy?.id)} current={current?.kind === "plan"} className="project-step">
        <StepMarker number={2} status={steps.plan} />
        <span className="min-w-0 flex-1">
          <span className="block font-semibold">{t("plan")}</span>
          <span className="block text-xs text-slate-500">
            {latestStrategy ? t("planPages", { count: latestStrategy.pageCount }) : t("planToCreate")}
          </span>
        </span>
      </SidebarLink>

      <div className="project-sidebar-separator" role="presentation" />
      <SidebarLink href={`/projects/${projectId}/settings`} current={current?.kind === "settings"} className="project-topic">
        {t("settings")}
      </SidebarLink>
    </nav>
  );
}
