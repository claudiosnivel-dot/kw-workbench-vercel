import { getFormatter, getTranslations } from "next-intl/server";
import { PlanActions } from "@/components/plan/plan-actions";
import { PlanBoard } from "@/components/plan/plan-board";
import { PlanGroupingNotice } from "@/components/plan/plan-grouping-notice";
import { PlanShell } from "@/components/plan/plan-header";
import { ActivePlanRun } from "@/components/plan/plan-run-progress";
import { StrategySettings } from "@/components/strategy/strategy-settings";
import { isAiTitlesAvailable, isArticlesAvailable } from "@/lib/ai/settings";
import { articlePageIds } from "@/lib/articles/service";
import { requirePageUser } from "@/lib/auth/page-guard";
import { canPerform } from "@/lib/authz/permissions";
import type { PlanGroup, PlanView } from "@/lib/modules/next-step";
import { readActivePlanRun } from "@/lib/modules/plan-runs/service";
import { requireProjectPage } from "@/lib/modules/project-pages";
import { DEFAULT_RULES, RULE_LIMITS } from "@/lib/modules/strategy/rules";
import { listStrategies, readStrategy } from "@/lib/modules/strategy/service";

export const dynamic = "force-dynamic";

type SearchParams = Record<string, string | string[] | undefined>;

const single = (value: string | string[] | undefined) => (Array.isArray(value) ? value[0] : value);

/**
 * Piano dei contenuti del progetto (T-2502, T-2504): il piano è la strategia più recente. Senza piano, «Costruisci il
 * piano» con le opzioni avanzate chiuse; con il piano, intestazione con «Rigenera», versioni precedenti e menu ⋯, poi la
 * bacheca. group, view e page arrivano dall'URL; l'Esporta della barra in alto riceve il piano aperto (T-2406). Il
 * pannello della pagina propone i titoli con l'AI se la funzione è accesa e l'utente può modificare il piano (T-3603), e
 * l'articolo: «Apri l'articolo» se c'è, altrimenti «Scrivi l'articolo con l'AI» con gli articoli accesi (T-4401).
 * Con un lavoro di piano attivo la pagina ne mostra l'avanzamento, al posto di «Costruisci il piano» se il piano non c'è
 * ancora (T-6202); con il raggruppamento di riserva un avviso sopra il piano ne dice il motivo.
 */
export default async function PlanPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<SearchParams> }) {
  const user = await requirePageUser();
  const [{ id }, query] = await Promise.all([params, searchParams]);
  const project = await requireProjectPage(user.id, id, {
    subprojects: { orderBy: [{ position: "asc" }, { created_at: "asc" }], select: { id: true, name: true } },
  });
  const [strategies, activeRun, t, tStrategy, format] = await Promise.all([
    listStrategies(project.id),
    readActivePlanRun(project.id),
    getTranslations("plan"),
    getTranslations("strategy.ui"),
    getFormatter(),
  ]);
  const settings = { projectId: project.id, sections: project.subprojects, defaults: DEFAULT_RULES, limits: RULE_LIMITS };

  if (strategies.length === 0) {
    return (
      <section className="card space-y-4">
        <h1 className="text-2xl font-semibold">{t("title")}</h1>
        <div className="space-y-1">
          <h2 className="text-lg font-semibold">{t("empty.title")}</h2>
          <p className="text-sm text-slate-600">{t("empty.text")}</p>
        </div>
        {activeRun ? <ActivePlanRun projectId={project.id} runId={activeRun.id} /> : <StrategySettings {...settings} />}
      </section>
    );
  }

  const canWrite = canPerform(project.role, "strategy.write");
  const [strategy, aiTitlesAvailable, articlesAvailable, pageIds] = await Promise.all([
    readStrategy(project.id, strategies[0].id),
    canWrite ? isAiTitlesAvailable() : false,
    canWrite ? isArticlesAvailable() : false,
    articlePageIds(project.id),
  ]);
  const group: PlanGroup = single(query.group) === "status" ? "status" : "hub";
  const viewParam = single(query.view);
  const view: PlanView | null = viewParam === "board" || viewParam === "list" ? viewParam : null;
  const openPageId = single(query.page) ?? null;

  return (
    <PlanShell
      strategy={strategy}
      title={t("title")}
      meta={(pages) => t("meta", { date: format.dateTime(new Date(strategy.createdAt), { dateStyle: "medium" }), pages })}
      // La chiave è il piano: a piano rigenerato le azioni ripartono con il dialogo «Rigenera il piano» chiuso (T-6202).
      actions={<PlanActions key={strategy.id} {...settings} plan={{ id: strategy.id, name: strategy.name }} versionCount={strategies.length - 1} />}
      intro={
        <>
          <p className="text-sm text-slate-600">{t("intro")}</p>
          {strategy.truncated && <p className="text-sm text-slate-600">{tStrategy("truncated")}</p>}
          <PlanGroupingNotice grouping={{ source: strategy.groupingSource, notice: strategy.groupingNotice }} />
        </>
      }
    >
      {activeRun && <ActivePlanRun projectId={project.id} runId={activeRun.id} />}
      <PlanBoard
        key={openPageId ?? ""}
        projectId={project.id}
        strategy={strategy}
        group={group}
        view={view}
        readOnly={false}
        aiTitlesAvailable={aiTitlesAvailable}
        articles={{ available: articlesAvailable, pageIds }}
        openPageId={openPageId}
      />
    </PlanShell>
  );
}
