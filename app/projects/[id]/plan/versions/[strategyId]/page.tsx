import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getFormatter, getTranslations } from "next-intl/server";
import { PlanBoard } from "@/components/plan/plan-board";
import { PlanShell } from "@/components/plan/plan-header";
import { requirePageUser } from "@/lib/auth/page-guard";
import { planHref, planVersionsHref } from "@/lib/modules/next-step";
import { requireProjectPage } from "@/lib/modules/project-pages";
import { findPlanId, readStrategy, StrategyNotFoundError } from "@/lib/modules/strategy/service";

export const dynamic = "force-dynamic";

/**
 * Versione precedente del piano in sola lettura (T-2502): vista elenco e pannello senza campi né menu (T-2505). Il piano
 * corrente porta alla pagina del piano; una strategia di un altro progetto risponde 404 (CWE-639).
 */
export default async function PlanVersionPage({ params }: { params: Promise<{ id: string; strategyId: string }> }) {
  const user = await requirePageUser();
  const { id, strategyId } = await params;
  const project = await requireProjectPage(user.id, id, {});
  if ((await findPlanId(project.id)) === strategyId) {
    redirect(planHref(project.id));
  }
  const strategy = await readStrategy(project.id, strategyId).catch((error: unknown) => {
    if (error instanceof StrategyNotFoundError) notFound();
    throw error;
  });
  const [t, format] = await Promise.all([getTranslations("plan.versionsPage"), getFormatter()]);
  const date = format.dateTime(new Date(strategy.createdAt), { dateStyle: "medium", timeStyle: "short" });

  return (
    <PlanShell
      strategy={strategy}
      title={strategy.name}
      meta={() => t("readOnly", { date })}
      actions={
        <Link className="btn-secondary w-full text-center sm:w-auto" href={planVersionsHref(project.id)}>
          {t("title")}
        </Link>
      }
    >
      <PlanBoard projectId={project.id} strategy={strategy} group="hub" view="list" readOnly aiTitlesAvailable={false} openPageId={null} />
    </PlanShell>
  );
}
