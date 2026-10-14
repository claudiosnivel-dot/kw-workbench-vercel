"use client";

import { useFormatter, useTranslations } from "next-intl";
import type { KeywordRowData, OptionalKeywordColumn } from "@/lib/modules/keywords-options";

type KeywordTableProps = {
  /** Nome accessibile della tabella: tenute o scartate. */
  label: string;
  rows: KeywordRowData[];
  showTopic: boolean;
  columns: Set<OptionalKeywordColumn>;
  /** Righe con una scelta in corso di salvataggio: il pulsante resta disattivato. */
  pendingIds: Set<string>;
  onToggle: (row: KeywordRowData) => void;
};

/** Barra del potenziale: larghezza impostata dal DOM, la CSP non ammette l'attributo style (T-505). */
function PotentialBar({ score }: { score: number | null }) {
  const t = useTranslations("keywords.table");
  const value = Math.round(score ?? 0);
  return (
    <span className="flex items-center gap-2">
      <span className="potential-track" aria-hidden="true">
        <span
          className="potential-fill"
          ref={(node) => {
            if (node) node.style.width = `${Math.min(100, Math.max(0, value))}%`;
          }}
        />
      </span>
      <span className="sr-only">{score === null ? t("potentialMissing") : t("potentialValue", { value })}</span>
    </span>
  );
}

/**
 * Elenco delle keyword (T-2403): un pulsante tieni/scarta per riga (aria-pressed vero sulle scartate), la keyword con le
 * etichette domanda, per comprare, locale e marchio da controllare, le ricerche al mese e la barra Potenziale (nascosta
 * sotto i 640 px), più le colonne facoltative scelte. Le keyword sono rese come testo (CWE-79).
 */
export function KeywordTable({ label, rows, showTopic, columns, pendingIds, onToggle }: KeywordTableProps) {
  const t = useTranslations("keywords");
  const tResults = useTranslations("results");
  const tSource = useTranslations("export.values.source");
  const format = useFormatter();
  const show = (column: OptionalKeywordColumn) => columns.has(column);
  // Una fonte senza etichetta nel catalogo non si mostra così com'è (T-2604).
  const sourceLabel = (source: string) => {
    const key = source as Parameters<typeof tSource>[0];
    return tSource.has(key) ? tSource(key) : t("table.otherSource");
  };

  return (
    <div className="table-shell">
      <table aria-label={label} className="table-enterprise text-left text-sm">
        <thead>
          <tr>
            <th className="w-12 px-2 py-2">
              <span className="sr-only">{t("table.action")}</span>
            </th>
            {showTopic && <th className="px-3 py-2">{t("table.topic")}</th>}
            <th className="px-3 py-2">{t("table.keyword")}</th>
            <th className="px-3 py-2 text-right">{t("table.searches")}</th>
            <th className="hidden px-3 py-2 sm:table-cell">{t("table.potential")}</th>
            {show("source") && <th className="px-3 py-2">{t("columns.source")}</th>}
            {show("intent") && <th className="px-3 py-2">{t("columns.intent")}</th>}
            {show("type") && <th className="px-3 py-2">{t("columns.type")}</th>}
            {show("competition") && <th className="px-3 py-2 text-right">{t("columns.competition")}</th>}
            {show("score") && <th className="px-3 py-2 text-right">{t("columns.score")}</th>}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.id} data-keyword-id={row.id}>
              <td className="px-2 py-2">
                <button
                  type="button"
                  className={`keyword-toggle ${row.discarded ? "is-discarded" : ""}`}
                  aria-pressed={row.discarded}
                  aria-label={row.discarded ? t("row.keep", { keyword: row.keyword }) : t("row.discard", { keyword: row.keyword })}
                  disabled={pendingIds.has(row.id)}
                  onClick={() => onToggle(row)}
                >
                  <span aria-hidden="true">{row.discarded ? "↺" : "✕"}</span>
                </button>
              </td>
              {showTopic && <td className="px-3 py-2 text-slate-600">{row.topicName}</td>}
              <td className="px-3 py-2">
                <span className={row.discarded ? "text-slate-500 line-through" : "font-medium"}>{row.keyword}</span>
                <span className="ml-2 inline-flex flex-wrap gap-1 align-middle">
                  {row.question && <span className="keyword-tag">{t("tags.question")}</span>}
                  {row.buy && <span className="keyword-tag">{t("tags.buy")}</span>}
                  {row.local && <span className="keyword-tag">{t("tags.local")}</span>}
                  {row.brandReview && <span className="keyword-tag is-warning">{t("tags.brandReview")}</span>}
                </span>
              </td>
              <td className="px-3 py-2 text-right tabular-nums">{row.searches === null ? "—" : format.number(row.searches)}</td>
              <td className="hidden px-3 py-2 sm:table-cell">
                <PotentialBar score={row.score} />
              </td>
              {show("source") && <td className="px-3 py-2">{sourceLabel(row.source)}</td>}
              {show("intent") && <td className="px-3 py-2">{tResults(`intent.${row.intent}` as Parameters<typeof tResults>[0])}</td>}
              {show("type") && <td className="px-3 py-2">{tResults(`type.${row.type}` as Parameters<typeof tResults>[0])}</td>}
              {show("competition") && (
                <td className="px-3 py-2 text-right tabular-nums">
                  {row.competition === null ? "—" : format.number(row.competition, { maximumFractionDigits: 2 })}
                </td>
              )}
              {show("score") && (
                <td className="px-3 py-2 text-right tabular-nums">
                  {row.score === null ? "—" : format.number(row.score, { maximumFractionDigits: 1 })}
                </td>
              )}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
