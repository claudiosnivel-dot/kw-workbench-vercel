import Link from "next/link";
import { getFormatter, getTranslations } from "next-intl/server";
import { PlanVersionMenu } from "@/components/plan/plan-version-menu";
import { requirePageUser } from "@/lib/auth/page-guard";
import { planHref, planVersionHref, planVersionsHref } from "@/lib/modules/next-step";
import { requireProjectPage } from "@/lib/modules/project-pages";
import { listStrategies } from "@/lib/modules/strategy/service";

export const dynamic = "force-dynamic";

/**
 * Versioni precedenti del piano (T-2502): le strategie del progetto tranne la più recente, dalla più nuova, con data,
 * modalità e numero di pagine; ognuna si apre in sola lettura e si può eliminare dal suo menu.
 */
export default async function PlanVersionsPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requirePageUser();
  const { id } = await params;
  const project = await requireProjectPage(user.id, id, {});
  const [strategies, t, tStrategy, format] = await Promise.all([
    listStrategies(project.id),
    getTranslations("plan.versionsPage"),
    getTranslations("strategy.ui"),
    getFormatter(),
  ]);
  const versions = strategies.slice(1);

  return (
    <section className="card space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <h1 className="text-2xl font-semibold">{t("title")}</h1>
        <Link className="btn-secondary w-full text-center sm:w-auto" href={planHref(project.id)}>
          {t("back")}
        </Link>
      </div>
      <p className="text-sm text-slate-600">{t("intro")}</p>
      {versions.length === 0 ? (
        <p className="text-sm text-slate-500">{t("empty")}</p>
      ) : (
        <div className="table-shell">
          <table className="table-enterprise min-w-[560px] text-left text-sm sm:min-w-full">
            <thead>
              <tr>
                <th className="px-3 py-2">{t("columns.name")}</th>
                <th className="px-3 py-2">{t("columns.created")}</th>
                <th className="px-3 py-2">{t("columns.mode")}</th>
                <th className="px-3 py-2">{t("columns.pages")}</th>
                <th className="px-3 py-2">
                  <span className="sr-only">{t("menuColumn")}</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {versions.map((version) => (
                <tr key={version.id}>
                  <td className="px-3 py-2 font-medium">
                    <Link className="underline" href={planVersionHref(project.id, version.id)}>
                      {version.name}
                    </Link>
                  </td>
                  <td className="px-3 py-2">{format.dateTime(new Date(version.createdAt), { dateStyle: "medium", timeStyle: "short" })}</td>
                  <td className="px-3 py-2">{tStrategy(`mode.${version.mode}`)}</td>
                  <td className="px-3 py-2">{format.number(version.pageCount)}</td>
                  <td className="px-3 py-2 text-right">
                    <PlanVersionMenu projectId={project.id} version={{ id: version.id, name: version.name }} redirectTo={planVersionsHref(project.id)} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
