"use client";

import Link from "next/link";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { NewTopicDialog } from "@/components/new-topic-dialog";
import { NextStepAction } from "@/components/next-step-action";
import { ProjectCardMenu } from "@/components/project-card-menu";
import { PlanProgress } from "@/components/plan/plan-progress";
import { StepMarker } from "@/components/project-sidebar";
import type { ProjectProgressData } from "@/lib/modules/next-step";

type ProjectCardProps = {
  project: { id: string; name: string };
  /** Ultima attività in ISO 8601 e la stessa data relativa già formattata dal server («ieri», «3 giorni fa»). */
  lastActivity: { iso: string; label: string };
  progress: Pick<ProjectProgressData, "steps" | "next" | "keptCount" | "latestStrategy">;
  /** Pulsante primario pieno: solo per il primo progetto dell'elenco (D-39). */
  primary: boolean;
  canDelete: boolean;
};

/**
 * Scheda di un progetto nella home (T-2305): nome, stato delle tappe come nella barra laterale, ultima attività, un solo
 * pulsante con il prossimo passo del progetto e il menu ⋯. Con un piano anche la barra e il testo dell'avanzamento della
 * scrittura (T-2506). Nomi resi come testo (CWE-79).
 */
export function ProjectCard({ project, lastActivity, progress, primary, canDelete }: ProjectCardProps) {
  const t = useTranslations("dashboard.card");
  const [addingTopic, setAddingTopic] = useState(false);
  const { steps, next, keptCount, latestStrategy } = progress;

  return (
    <li className="project-card">
      <div className="min-w-0 flex-1 space-y-1.5">
        <h2 className="truncate text-base font-semibold">
          <Link href={`/projects/${project.id}`} className="underline-offset-2 hover:underline">
            {project.name}
          </Link>
        </h2>
        <p className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-slate-600">
          <span className="inline-flex items-center gap-2">
            <StepMarker number={1} status={steps.keywords} />
            {keptCount > 0 ? t("keywords", { count: keptCount }) : t("noKeywords")}
          </span>
          <span className="inline-flex items-center gap-2">
            <StepMarker number={2} status={steps.plan} />
            {latestStrategy ? t("planPages", { count: latestStrategy.pageCount }) : t("planToCreate")}
          </span>
        </p>
        {latestStrategy && latestStrategy.pageCount > 0 && (
          <div className="max-w-sm space-y-1">
            <p className="text-sm text-slate-600">
              {t("writing", { published: latestStrategy.publishedCount, total: latestStrategy.pageCount })}
            </p>
            <PlanProgress
              compact
              counts={{
                published: latestStrategy.publishedCount,
                writing: latestStrategy.writingCount,
                todo: latestStrategy.pageCount - latestStrategy.publishedCount - latestStrategy.writingCount,
              }}
            />
          </div>
        )}
      </div>
      <time dateTime={lastActivity.iso} className="text-xs text-slate-500">
        {lastActivity.label}
      </time>
      <NextStepAction projectId={project.id} next={next} onAddTopic={() => setAddingTopic(true)} primary={primary} />
      <ProjectCardMenu project={project} canDelete={canDelete} />
      {addingTopic && <NewTopicDialog projectId={project.id} onClose={() => setAddingTopic(false)} />}
    </li>
  );
}
