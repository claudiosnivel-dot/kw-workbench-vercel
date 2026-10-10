import { getBrandingSnapshot } from "@/lib/integrations/branding";
import type { CsvDialect } from "@/lib/modules/export";
import { strategyCsv, strategyFileName, strategyXlsx } from "@/lib/modules/strategy/export";
import { renderStrategyPdf } from "@/lib/modules/strategy/pdf";
import { loadPdfLogo } from "@/lib/modules/strategy/pdf-logo";
import type { StrategyView } from "@/lib/modules/strategy/types";
import { prisma } from "@/lib/prisma";

export const STRATEGY_DOWNLOAD_FORMATS = ["csv", "xlsx", "pdf"] as const;
export type StrategyDownloadFormat = (typeof STRATEGY_DOWNLOAD_FORMATS)[number];

const CONTENT_TYPES: Record<StrategyDownloadFormat, string> = {
  csv: "text/csv; charset=utf-8",
  xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  pdf: "application/pdf",
};

type DownloadParams = {
  project: { id: string; name: string; workspace_id: string };
  strategy: StrategyView;
  format: StrategyDownloadFormat;
  csvDialect: CsvDialect;
  /** Lingua delle spiegazioni del PDF. */
  locale: string;
};

async function pdfOf({ project, strategy, locale }: DownloadParams): Promise<Buffer> {
  const settings = (strategy.settings ?? {}) as { sectionId?: string | null };
  const [workspace, section, branding] = await Promise.all([
    prisma.workspace.findUniqueOrThrow({ where: { id: project.workspace_id }, select: { name: true } }),
    settings.sectionId
      ? prisma.subproject.findFirst({ where: { id: settings.sectionId, project_id: project.id }, select: { name: true } })
      : null,
    getBrandingSnapshot(),
  ]);
  return renderStrategyPdf({
    strategy,
    projectName: project.name,
    workspaceName: workspace.name,
    sectionName: section?.name ?? null,
    appName: branding.appName,
    logo: await loadPdfLogo(branding.logoUrl),
    locale,
    generatedAt: new Date(),
  });
}

/**
 * Risposta con il file dell'export della strategia (T-1906, T-1907): allegato con il nome normalizzato, mai in cache
 * (Cache-Control no-store).
 */
export async function strategyDownload(params: DownloadParams): Promise<Response> {
  const body =
    params.format === "csv"
      ? strategyCsv(params.strategy, params.csvDialect)
      : params.format === "xlsx"
        ? await strategyXlsx(params.strategy)
        : await pdfOf(params);
  const filename = strategyFileName(params.strategy.name, params.format);
  const headers = new Headers({ "Content-Type": CONTENT_TYPES[params.format], "Cache-Control": "no-store" });
  headers.set("Content-Disposition", `attachment; filename="${filename}"`);
  return new Response(new Uint8Array(body), { status: 200, headers });
}
