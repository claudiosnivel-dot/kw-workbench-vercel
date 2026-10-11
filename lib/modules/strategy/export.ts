import ExcelJS from "exceljs";
import { type CsvDialect, csvHeader, csvRecord } from "@/lib/modules/export";
import { type CatalogTranslator, catalogTranslator } from "@/lib/modules/strategy/translator";
import type { StrategyPageView, StrategyView } from "@/lib/modules/strategy/types";

/*
 * Export del piano (T-1906): una riga per pagina nell'ordine di lavoro, nei formati dell'export dei risultati e con
 * la stessa protezione dalle formule (CSV con l'apice, XLSX con celle di testo). Intestazioni, tipo di pagina, tipo di
 * contenuto e nome del foglio sono nella lingua dell'utente (T-2102); le colonne tecniche restano l'identificatore
 * interno e l'ordine.
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

/** Tabella dell'export in una lingua: nome del foglio, intestazioni e righe (CSV, XLSX e Google Sheets, T-2102). */
export type StrategyExportTable = { sheet: string; columns: string[]; rows: Cell[][] };

function pageRow(page: StrategyPageView, hub: StrategyPageView, links: string[], t: CatalogTranslator): Cell[] {
  const main = page.keywords.find((keyword) => keyword.role === "MAIN");
  const volumes = page.keywords.map((keyword) => keyword.volume).filter((volume): volume is number => volume !== null);
  return [
    hub.h1,
    t(`ui.kind.${page.kind}`),
    page.h1,
    page.h2.join(JOIN),
    main?.keyword ?? "",
    page.keywords.filter((keyword) => keyword !== main).map((keyword) => keyword.keyword).join(JOIN),
    t(`ui.contentTypes.${page.contentType}`),
    volumes.length > 0 ? volumes.reduce((sum, volume) => sum + volume, 0) : null,
    page.priority,
    links.join(JOIN),
  ];
}

/**
 * Export nella lingua data (T-2102): etichette dei cataloghi (strategy.export, e per tipo di pagina e di contenuto
 * quelle della pagina della strategia); righe nell'ordine di lavoro, ogni hub seguito dai suoi spoke, con i link
 * interni spoke ↔ hub.
 */
export function strategyExportTable(strategy: StrategyView, locale: string): StrategyExportTable {
  const t = catalogTranslator(locale, "strategy");
  return {
    sheet: t("export.sheet"),
    columns: STRATEGY_EXPORT_COLUMNS.map((column) => t(`export.columns.${column}`)),
    rows: strategy.hubs.flatMap(({ pillar, spokes }) => [
      pageRow(pillar, pillar, spokes.map((spoke) => spoke.h1), t),
      ...spokes.map((spoke) => pageRow(spoke, pillar, [pillar.h1], t)),
    ]),
  };
}

export function strategyCsv(table: StrategyExportTable, dialect: CsvDialect): Buffer {
  const text = csvHeader(table.columns, dialect) + table.rows.map((row) => csvRecord(row, dialect)).join("");
  return Buffer.from(text, "utf8");
}

/** Un foglio con il nome tradotto: numeri come numeri, ogni testo come cella di testo (mai una formula). */
export async function strategyXlsx(table: StrategyExportTable): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet(table.sheet);
  sheet.addRow(table.columns);
  for (const row of table.rows) {
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
