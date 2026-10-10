import ExcelJS from "exceljs";
import { type CsvDialect, csvHeader, csvRecord } from "@/lib/modules/export";
import type { StrategyPageView, StrategyView } from "@/lib/modules/strategy/types";

/*
 * Export del piano (T-1906): una riga per pagina nell'ordine di lavoro, nei formati dell'export dei risultati e con
 * la stessa protezione dalle formule (CSV con l'apice, XLSX con celle di testo).
 */

export const STRATEGY_EXPORT_COLUMNS = [
  "hub",
  "page_type",
  "h1",
  "h2",
  "main_keyword",
  "secondary_keywords",
  "content_type",
  "volume",
  "priority",
  "internal_links",
] as const;

const JOIN = " | ";

type Cell = string | number | null;

function pageRow(page: StrategyPageView, hub: StrategyPageView, links: string[]): Cell[] {
  const main = page.keywords.find((keyword) => keyword.role === "MAIN");
  const volumes = page.keywords.map((keyword) => keyword.volume).filter((volume): volume is number => volume !== null);
  return [
    hub.h1,
    page.kind,
    page.h1,
    page.h2.join(JOIN),
    main?.keyword ?? "",
    page.keywords.filter((keyword) => keyword !== main).map((keyword) => keyword.keyword).join(JOIN),
    page.contentType,
    volumes.length > 0 ? volumes.reduce((sum, volume) => sum + volume, 0) : null,
    page.priority,
    links.join(JOIN),
  ];
}

/** Righe dell'export nell'ordine di lavoro: ogni hub seguito dai suoi spoke; link interni spoke ↔ hub. */
export function strategyExportRows(strategy: StrategyView): Cell[][] {
  return strategy.hubs.flatMap(({ pillar, spokes }) => [
    pageRow(pillar, pillar, spokes.map((spoke) => spoke.h1)),
    ...spokes.map((spoke) => pageRow(spoke, pillar, [pillar.h1])),
  ]);
}

export function strategyCsv(strategy: StrategyView, dialect: CsvDialect): Buffer {
  const text =
    csvHeader(STRATEGY_EXPORT_COLUMNS, dialect) + strategyExportRows(strategy).map((row) => csvRecord(row, dialect)).join("");
  return Buffer.from(text, "utf8");
}

/** Foglio «strategia»: numeri come numeri, ogni testo come cella di testo (mai una formula). */
export async function strategyXlsx(strategy: StrategyView): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet("strategia");
  sheet.addRow([...STRATEGY_EXPORT_COLUMNS]);
  for (const row of strategyExportRows(strategy)) {
    sheet.addRow(row.map((cell) => cell ?? ""));
  }
  return Buffer.from(await workbook.xlsx.writeBuffer());
}

/** Nome del file: nome della strategia normalizzato (minuscole senza accenti, trattini), poi la data. */
export function strategyFileName(name: string, extension: string, date = new Date()): string {
  const slug =
    name
      .normalize("NFD")
      .replace(/\p{M}+/gu, "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 60)
      .replace(/-+$/g, "") || "strategy";
  return `seo-god-mode-strategy-${slug}-${date.toISOString().slice(0, 10)}.${extension}`;
}
