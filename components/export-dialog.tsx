"use client";

import { useTranslations } from "next-intl";
import { type ReactNode, useId, useState } from "react";
import { ModalDialog } from "@/components/modal-dialog";
import { messageOf, readApiResponse, sendJson } from "@/lib/client/http";
import type { ExportFormat, ExportScope } from "@/lib/modules/export-types";
import { buildResultsExportHref } from "@/lib/modules/results-view";

/** Pagina da cui si apre la finestra: decide le scelte iniziali. */
export type ExportOrigin = { kind: "topic"; topicId: string } | { kind: "project" } | { kind: "plan" };

export type ExportDialogProps = {
  projectId: string;
  projectName: string;
  origin: ExportOrigin;
  topics: { id: string; name: string; keptCount: number; totalCount: number }[];
  /** Tenute di tutto il progetto. */
  keptCount: number;
  /** Strategia esportata come piano dei contenuti: quella aperta o la più recente; null senza strategie. */
  plan: { strategyId: string; pageCount: number } | null;
  /** Vista filtrata della pagina delle keyword: «Solo quelle che vedi ora», solo con filtri attivi. */
  view: { count: number; filters: Record<string, string> } | null;
  sheetsConnected: boolean;
  /** Il branding ha un logo: il PDF può averlo in copertina. */
  hasLogo: boolean;
  onClose: () => void;
};

type What = "plan" | "keywords";
type Which = "keptTopic" | "keptProject" | "filtered" | "all";
type Format = "pdf" | "sheets" | "xlsx" | "csv" | "json";

const PLAN_FORMATS: Format[] = ["pdf", "sheets", "xlsx", "csv"];
const KEYWORD_FORMATS: Format[] = ["sheets", "xlsx", "csv"];

function Choice({ name, value, checked, disabled, onChange, children }: {
  name: string;
  value: string;
  checked: boolean;
  disabled?: boolean;
  onChange: () => void;
  children: ReactNode;
}) {
  return (
    <label className={`export-choice ${disabled ? "is-disabled" : ""}`}>
      <input type="radio" name={name} value={value} checked={checked} disabled={disabled} onChange={onChange} />
      <span>{children}</span>
    </label>
  );
}

/** Ambito, argomento e filtri dell'export delle keyword per la scelta Quali (T-2402). */
function keywordScope(which: Which, origin: ExportOrigin, view: ExportDialogProps["view"]) {
  const topicId = origin.kind === "topic" ? origin.topicId : null;
  const scope: ExportScope = which === "filtered" ? "filtered" : which === "all" ? "all" : "kept";
  const subprojectId = which === "keptProject" ? null : topicId;
  const filters = which === "filtered" ? (view?.filters ?? {}) : {};
  return { scope, subprojectId, filters };
}

/**
 * Finestra Esporta (T-2406): tre domande, Cosa (il piano dei contenuti, disattivato senza strategie, o le keyword), Quali
 * (solo per le keyword: tenute dell'argomento o del progetto, la vista filtrata solo con filtri attivi, tutte) e Formato,
 * già impostate in base alla pagina. Il pulsante finale dice cosa succede: scarica il file dalle rotte di export esistenti
 * (che verificano progetto e strategia nel workspace) oppure crea il foglio Google; senza Google collegato avvia il
 * collegamento (T-906). In Avanzate: JSON, separatore del CSV e nome del foglio.
 */
export function ExportDialog(props: ExportDialogProps) {
  const { projectId, projectName, origin, topics, plan, view, sheetsConnected, hasLogo, onClose } = props;
  const t = useTranslations("exportDialog");
  const tErrors = useTranslations("errors");
  const tCommon = useTranslations("common");
  const sheetNameId = useId();
  const dialectId = useId();
  const topic = origin.kind === "topic" ? topics.find((item) => item.id === origin.topicId) : undefined;
  const [what, setWhat] = useState<What>(origin.kind === "plan" && plan ? "plan" : "keywords");
  const [which, setWhich] = useState<Which>(topic ? "keptTopic" : "keptProject");
  const [format, setFormat] = useState<Format>(what === "plan" ? "pdf" : "xlsx");
  const [withLogo, setWithLogo] = useState(true);
  const [withStatus, setWithStatus] = useState(false);
  const [csvDialect, setCsvDialect] = useState("excel-it");
  const [sheetName, setSheetName] = useState(`${projectName} ${new Date().toISOString().slice(0, 10)}`);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sheet, setSheet] = useState<{ url: string; rows: number } | null>(null);

  const formats = what === "plan" ? PLAN_FORMATS : KEYWORD_FORMATS;
  const choose = (next: What) => {
    setWhat(next);
    if (next === "plan" ? !PLAN_FORMATS.includes(format) : !KEYWORD_FORMATS.includes(format) && format !== "json") {
      setFormat(next === "plan" ? "pdf" : "xlsx");
    }
  };
  const allCount = topic ? topic.totalCount : topics.reduce((sum, item) => sum + item.totalCount, 0);

  const downloadHref = (): string => {
    if (what === "plan" && plan) {
      const query = new URLSearchParams({ format });
      if (format === "csv") query.set("csvDialect", csvDialect);
      if (format === "pdf" && hasLogo && !withLogo) query.set("logo", "0");
      if (format === "pdf" && withStatus) query.set("status", "1");
      return `/api/projects/${projectId}/strategies/${plan.strategyId}/export?${query.toString()}`;
    }
    const { scope, subprojectId, filters } = keywordScope(which, origin, view);
    const href = buildResultsExportHref(
      projectId,
      subprojectId ? { kind: "section", subprojectId } : { kind: "all" },
      new URLSearchParams(filters),
      format as ExportFormat,
      scope
    );
    return format === "csv" ? `${href}&csvDialect=${csvDialect}` : href;
  };

  const createSheet = async () => {
    const fileName = sheetName.trim();
    if (!fileName) {
      setError(t("sheetNameRequired"));
      return;
    }
    setPending(true);
    setError(null);
    setSheet(null);
    try {
      const body =
        what === "plan" && plan
          ? { url: `/api/projects/${projectId}/strategies/${plan.strategyId}/export/google-sheets`, payload: { fileName } }
          : {
              url: `/api/projects/${projectId}/export/google-sheets`,
              payload: (() => {
                const { scope, subprojectId, filters } = keywordScope(which, origin, view);
                return { fileName, scope, subprojectId: subprojectId ?? undefined, filters };
              })(),
            };
      const payload = await readApiResponse<{ data?: { spreadsheetUrl: string; exportedRows: number } }>(
        await sendJson("POST", body.url, body.payload),
        tErrors
      );
      if (payload?.data) {
        setSheet({ url: payload.data.spreadsheetUrl, rows: payload.data.exportedRows });
      }
    } catch (sheetError) {
      setError(messageOf(sheetError, tCommon("unexpectedError")));
    } finally {
      setPending(false);
    }
  };

  const run = () => {
    if (format === "sheets") {
      void createSheet();
      return;
    }
    window.location.assign(downloadHref());
    onClose();
  };

  return (
    <ModalDialog title={t("title")} onClose={() => !pending && onClose()}>
      <fieldset className="space-y-2">
        <legend className="label">{t("what")}</legend>
        <Choice name="what" value="plan" checked={what === "plan"} disabled={!plan} onChange={() => choose("plan")}>
          {plan ? t("plan", { count: plan.pageCount }) : t("planNone")}
          {!plan && <span className="block text-xs text-slate-500">{t("planDisabled")}</span>}
        </Choice>
        <Choice name="what" value="keywords" checked={what === "keywords"} onChange={() => choose("keywords")}>
          {t("keywords", { count: topic ? topic.keptCount : props.keptCount })}
        </Choice>
      </fieldset>

      {what === "keywords" && (
        <fieldset className="space-y-2">
          <legend className="label">{t("which")}</legend>
          {topic && (
            <Choice name="which" value="keptTopic" checked={which === "keptTopic"} onChange={() => setWhich("keptTopic")}>
              {t("keptTopic", { topic: topic.name, count: topic.keptCount })}
            </Choice>
          )}
          <Choice name="which" value="keptProject" checked={which === "keptProject"} onChange={() => setWhich("keptProject")}>
            {t("keptProject", { count: props.keptCount })}
          </Choice>
          {view && (
            <Choice name="which" value="filtered" checked={which === "filtered"} onChange={() => setWhich("filtered")}>
              {t("filtered", { count: view.count })}
            </Choice>
          )}
          <Choice name="which" value="all" checked={which === "all"} onChange={() => setWhich("all")}>
            {t("all", { count: allCount })}
          </Choice>
        </fieldset>
      )}

      <fieldset className="space-y-2">
        <legend className="label">{t("format")}</legend>
        {formats.map((option) => (
          <Choice key={option} name="format" value={option} checked={format === option} onChange={() => setFormat(option)}>
            {t(`formats.${option}`)}
          </Choice>
        ))}
        {format === "sheets" && !sheetsConnected && <p className="text-sm text-amber-200">{t("sheetsNotConnected")}</p>}
        {what === "plan" && format === "pdf" && hasLogo && (
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={withLogo} onChange={(event) => setWithLogo(event.target.checked)} />
            {t("logo")}
          </label>
        )}
        {/* Stato di scrittura delle pagine nel PDF (T-2501): spento di default, imposta status=1. */}
        {what === "plan" && format === "pdf" && (
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={withStatus} onChange={(event) => setWithStatus(event.target.checked)} />
            {t("status")}
          </label>
        )}
      </fieldset>

      <details className="space-y-2">
        <summary className="cursor-pointer text-sm font-medium">{t("advanced")}</summary>
        <div className="mt-2 space-y-3">
          {what === "keywords" && (
            <Choice name="format" value="json" checked={format === "json"} onChange={() => setFormat("json")}>
              {t("formats.json")}
            </Choice>
          )}
          <div>
            <label className="label" htmlFor={dialectId}>
              {t("csvDialect")}
            </label>
            <select id={dialectId} className="select" value={csvDialect} onChange={(event) => setCsvDialect(event.target.value)}>
              <option value="excel-it">{t("csvExcel")}</option>
              <option value="rfc4180">{t("csvStandard")}</option>
            </select>
          </div>
          <div>
            <label className="label" htmlFor={sheetNameId}>
              {t("sheetName")}
            </label>
            <input id={sheetNameId} className="input" value={sheetName} onChange={(event) => setSheetName(event.target.value)} />
          </div>
        </div>
      </details>

      {error && (
        <p className="text-sm text-red-700" role="alert">
          {error}
        </p>
      )}
      {sheet && (
        <div className="space-y-2 rounded-xl border border-emerald-400/40 bg-emerald-500/15 p-3 text-sm text-emerald-200" role="status">
          <p>{t("created", { rows: sheet.rows })}</p>
          <a className="btn-secondary inline-block" href={sheet.url} target="_blank" rel="noreferrer">
            {t("openSheet")}
          </a>
        </div>
      )}

      <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
        <button type="button" className="btn-secondary" onClick={onClose} disabled={pending}>
          {t("close")}
        </button>
        {format === "sheets" && !sheetsConnected ? (
          // Rotta API che avvia il redirect OAuth (T-906), non una pagina: serve una navigazione completa, non <Link>.
          // eslint-disable-next-line @next/next/no-html-link-for-pages
          <a className="btn-primary text-center" href="/api/integrations/google-sheets/connect">
            {t("connect")}
          </a>
        ) : (
          <button type="button" className="btn-primary" disabled={pending} onClick={run}>
            {format === "sheets" && pending ? t("creating") : t(`actions.${format}`)}
          </button>
        )}
      </div>
    </ModalDialog>
  );
}
