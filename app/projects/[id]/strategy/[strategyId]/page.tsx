import Link from "next/link";
import { notFound } from "next/navigation";
import { getFormatter, getTranslations } from "next-intl/server";
import { DeleteEntityButton } from "@/components/delete-entity-button";
import { GoogleSheetsExportButton } from "@/components/google-sheets-export-button";
import { StrategyPageCard } from "@/components/strategy/strategy-page-card";
import { StrategyUnassigned } from "@/components/strategy/strategy-unassigned";
import { requirePageUser } from "@/lib/auth/page-guard";
import { getGoogleSheetsCredentialSnapshot } from "@/lib/integrations/google-sheets";
import { requireProjectPage } from "@/lib/modules/project-pages";
import { readStrategy, StrategyNotFoundError } from "@/lib/modules/strategy/service";
import type { StrategyPageView } from "@/lib/modules/strategy/types";
import { formatDate } from "@/lib/view/format";

export const dynamic = "force-dynamic";

const EXPORTS = [
  { format: "csv", label: "exportCsv" },
  { format: "xlsx", label: "exportXlsx" },
  { format: "pdf", label: "exportPdf" },
] as const;

/**
 * Piano di una strategia (T-1905): sintesi, hub nell'ordine di lavoro con la pagina pilastro e la tabella degli spoke,
 * scheda di ogni pagina con i controlli di modifica, riquadro Non assegnate ed export (T-1906, T-1907).
 */
export default async function StrategyDetailPage({ params }: { params: Promise<{ id: string; strategyId: string }> }) {
  const user = await requirePageUser();
  const { id, strategyId } = await params;
  const project = await requireProjectPage(user.id, id, {});
  const strategy = await readStrategy(project.id, strategyId).catch((error: unknown) => {
    if (error instanceof StrategyNotFoundError) notFound();
    throw error;
  });
  const [t, format, googleSheets] = await Promise.all([
    getTranslations(),
    getFormatter(),
    getGoogleSheetsCredentialSnapshot(user.id),
  ]);

  const pages = strategy.hubs.flatMap((hub) => [hub.pillar, ...hub.spokes]);
  const volume = pages.reduce(
    (total, page) => total + page.keywords.reduce((sum, keyword) => sum + (keyword.volume ?? 0), 0),
    0
  );
  const destinationsFor = (page: StrategyPageView) =>
    pages.filter((other) => other.id !== page.id).map((other) => ({ id: other.id, label: other.h1 }));
  const apiBase = `/api/projects/${project.id}/strategies/${strategy.id}`;
  const listHref = `/projects/${project.id}/strategy`;
  const stats = [
    { label: "hubs", value: strategy.hubs.length },
    { label: "pages", value: pages.length },
    { label: "covered", value: strategy.assignedCount },
    { label: "volume", value: volume },
    { label: "unassigned", value: strategy.unassignedCount },
  ] as const;
  const cardProps = { projectId: project.id, strategyId: strategy.id, version: strategy.version };

  return (
    <div className="space-y-6">
      <section className="card space-y-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div className="space-y-1">
            <h1 className="text-2xl font-semibold">{strategy.name}</h1>
            <p className="text-sm text-slate-600">
              {t("strategy.ui.meta", {
                mode: t(`strategy.ui.mode.${strategy.mode}`),
                date: formatDate(strategy.createdAt, format),
                language: strategy.language,
              })}
            </p>
          </div>
          <Link className="btn-secondary w-full text-center sm:w-auto" href={listHref}>
            {t("strategy.ui.backToList")}
          </Link>
        </div>

        <dl className="grid gap-3 text-sm sm:grid-cols-5">
          {stats.map((stat) => (
            <div key={stat.label} className="rounded-xl border border-[var(--surface-border)] px-3 py-2">
              <dt className="text-slate-600">{t(`strategy.ui.stats.${stat.label}`)}</dt>
              <dd className="text-lg font-semibold" data-testid={`strategy-stat-${stat.label}`}>
                {format.number(stat.value)}
              </dd>
            </div>
          ))}
        </dl>
        {strategy.truncated && <p className="text-sm text-slate-600">{t("strategy.ui.truncated")}</p>}

        <div className="space-y-2">
          <h2 className="text-lg font-semibold">{t("strategy.ui.exportTitle")}</h2>
          <p className="text-sm text-slate-600">{t("strategy.ui.exportHint")}</p>
          <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap">
            <GoogleSheetsExportButton
              projectId={project.id}
              connected={googleSheets.connected}
              defaultFileName={`${project.name} - ${strategy.name}`}
              endpoint={`${apiBase}/export/google-sheets`}
            />
            {EXPORTS.map((item) => (
              <a key={item.format} className="btn-secondary w-full text-center sm:w-auto" href={`${apiBase}/export?format=${item.format}`}>
                {t(`strategy.ui.${item.label}`)}
              </a>
            ))}
            <DeleteEntityButton
              endpoint={apiBase}
              kind="strategy"
              name={strategy.name}
              buttonLabel={t("strategy.ui.deleteStrategy")}
              buttonClassName="btn-danger w-full sm:w-auto"
              redirectTo={listHref}
            />
          </div>
        </div>
      </section>

      {strategy.hubs.map((hub, index) => (
        <section key={hub.pillar.id} className="space-y-3" aria-labelledby={`hub-${hub.pillar.id}`}>
          <div className="card space-y-3">
            <h2 id={`hub-${hub.pillar.id}`} className="text-lg font-semibold">
              {t("strategy.ui.hubHeading", { number: index + 1, title: hub.pillar.h1 })}
            </h2>
            {hub.spokes.length === 0 ? (
              <p className="text-sm text-slate-500">{t("strategy.ui.spokesEmpty")}</p>
            ) : (
              <div className="table-shell">
                <table className="table-enterprise min-w-[680px] text-left text-sm sm:min-w-full">
                  <thead>
                    <tr>
                      <th className="px-3 py-2">{t("strategy.ui.spokeColumns.h1")}</th>
                      <th className="px-3 py-2">{t("strategy.ui.spokeColumns.mainKeyword")}</th>
                      <th className="px-3 py-2">{t("strategy.ui.spokeColumns.contentType")}</th>
                      <th className="px-3 py-2">{t("strategy.ui.spokeColumns.priority")}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {hub.spokes.map((spoke) => (
                      <tr key={spoke.id}>
                        <td className="px-3 py-2">{spoke.h1}</td>
                        <td className="px-3 py-2">{spoke.keywords.find((keyword) => keyword.role === "MAIN")?.keyword}</td>
                        <td className="px-3 py-2">{t(`strategy.ui.contentTypes.${spoke.contentType}`)}</td>
                        <td className="px-3 py-2">{format.number(spoke.priority)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
          <StrategyPageCard
            {...cardProps}
            page={hub.pillar}
            links={hub.spokes.map((spoke) => spoke.h1)}
            destinations={destinationsFor(hub.pillar)}
          />
          {hub.spokes.map((spoke) => (
            <StrategyPageCard key={spoke.id} {...cardProps} page={spoke} links={[hub.pillar.h1]} destinations={destinationsFor(spoke)} />
          ))}
        </section>
      ))}

      <StrategyUnassigned
        {...cardProps}
        keywords={strategy.unassigned}
        destinations={pages.map((page) => ({ id: page.id, label: page.h1 }))}
      />
    </div>
  );
}
