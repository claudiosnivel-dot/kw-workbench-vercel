import Link from "next/link";
import { getFormatter, getTranslations } from "next-intl/server";
import { StrategySettings } from "@/components/strategy/strategy-settings";
import { requirePageUser } from "@/lib/auth/page-guard";
import { requireProjectPage } from "@/lib/modules/project-pages";
import { DEFAULT_RULES, RULE_LIMITS } from "@/lib/modules/strategy/rules";
import { listStrategies } from "@/lib/modules/strategy/service";
import { formatDate } from "@/lib/view/format";

export const dynamic = "force-dynamic";

/** Strategie hub and spoke del progetto (T-1905): generazione automatica o esperta ed elenco delle strategie. */
export default async function StrategyListPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requirePageUser();
  const { id } = await params;
  const project = await requireProjectPage(user.id, id, {
    subprojects: { orderBy: [{ position: "asc" }, { created_at: "asc" }], select: { id: true, name: true } },
  });
  const [strategies, t, format] = await Promise.all([listStrategies(project.id), getTranslations(), getFormatter()]);

  return (
    <div className="space-y-6">
      <section className="card space-y-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div className="space-y-2">
            <h1 className="text-2xl font-semibold">{t("strategy.ui.title")}</h1>
            <p className="text-sm text-slate-600">{project.name}</p>
          </div>
          <Link className="btn-secondary w-full text-center sm:w-auto" href={`/projects/${project.id}`}>
            {t("projects.links.backToProject")}
          </Link>
        </div>
        <p className="text-sm text-slate-600">{t("strategy.ui.intro")}</p>
        <StrategySettings projectId={project.id} sections={project.subprojects} defaults={DEFAULT_RULES} limits={RULE_LIMITS} />
      </section>

      <section className="card space-y-3">
        <h2 className="text-lg font-semibold">{t("strategy.ui.listTitle")}</h2>
        {strategies.length === 0 ? (
          <p className="text-sm text-slate-500">{t("strategy.ui.empty")}</p>
        ) : (
          <div className="table-shell">
            <table className="table-enterprise min-w-[680px] text-left text-sm sm:min-w-full">
              <thead>
                <tr>
                  <th className="px-3 py-2">{t("strategy.ui.columns.name")}</th>
                  <th className="px-3 py-2">{t("strategy.ui.columns.mode")}</th>
                  <th className="px-3 py-2">{t("strategy.ui.columns.created")}</th>
                  <th className="px-3 py-2">{t("strategy.ui.columns.keywords")}</th>
                  <th className="px-3 py-2">{t("strategy.ui.columns.unassigned")}</th>
                </tr>
              </thead>
              <tbody>
                {strategies.map((strategy) => (
                  <tr key={strategy.id}>
                    <td className="px-3 py-3 font-medium">
                      <Link className="underline" href={`/projects/${project.id}/strategy/${strategy.id}`}>
                        {strategy.name}
                      </Link>
                    </td>
                    <td className="px-3 py-3">{t(`strategy.ui.mode.${strategy.mode}`)}</td>
                    <td className="px-3 py-3">{formatDate(strategy.createdAt, format)}</td>
                    <td className="px-3 py-3">{strategy.consideredCount}</td>
                    <td className="px-3 py-3">{strategy.unassignedCount}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
