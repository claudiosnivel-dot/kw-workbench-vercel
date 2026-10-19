"use client";

import { useFormatter, useTranslations } from "next-intl";
import { useEffect, useId, useState } from "react";
import { SettingsCard } from "@/components/settings-card";
import {
  addableModels,
  type CatalogModel,
  isCatalogStale,
  MAX_MODELS,
  type ModelCatalog,
  type ModelStatus,
  modelStatus,
  sameModel,
} from "@/lib/ai/models";
import { AI_LIMIT_MAX, type AiUsage, type UsageCounts } from "@/lib/ai/usage";
import { type ErrorTranslator, readApiResponse, readJsonSafe, sendJson } from "@/lib/client/http";
import { useSaveAction } from "@/lib/client/use-save-action";
import { formatDate } from "@/lib/view/format";

type AiTitlesView = {
  enabled: boolean;
  models: string[];
  platformDailyRequests: number;
  workspaceDailyLimit: number;
  articlesEnabled: boolean;
  articlesPerWorkspaceDaily: number;
  sectionRewritesPerWorkspaceDaily: number;
  keyConfigured: boolean;
  catalog: ModelCatalog | null;
  statuses: Record<string, ModelStatus>;
  addable: CatalogModel[];
  usage: AiUsage;
};

type LimitField = keyof typeof AI_LIMIT_MAX;
type AiTitlesInput = Pick<AiTitlesView, "enabled" | "models" | "articlesEnabled" | LimitField>;

/** PATCH delle impostazioni (T-3501): una risposta non riuscita lancia l'errore del catalogo. */
async function saveAiTitles(body: AiTitlesInput, tErrors: ErrorTranslator): Promise<{ data?: AiTitlesView } | null> {
  return readApiResponse(await sendJson("PATCH", "/api/admin/ai-titles", body), tErrors);
}

/** Rilettura del catalogo di OpenRouter (T-3803): un errore lascia la card com'era. */
async function refreshCatalog(): Promise<AiTitlesView | null> {
  try {
    const response = await fetch("/api/admin/ai-titles/catalog", { method: "POST" });
    return response.ok ? ((await readJsonSafe<{ data?: AiTitlesView }>(response))?.data ?? null) : null;
  } catch {
    return null;
  }
}

const TITLE_LIMITS: LimitField[] = ["platformDailyRequests", "workspaceDailyLimit"];
const ARTICLE_LIMITS: LimitField[] = ["articlesPerWorkspaceDaily", "sectionRewritesPerWorkspaceDaily"];
const LIMIT_LABELS = {
  platformDailyRequests: "platformLimit",
  workspaceDailyLimit: "workspaceLimit",
  articlesPerWorkspaceDaily: "articlesLimit",
  sectionRewritesPerWorkspaceDaily: "rewritesLimit",
} as const;
const USAGE_WINDOWS = ["last24h", "last7d"] as const;
const USAGE_COLUMNS = ["requests", "ok", "providerBusy", "accountDailyLimit", "other"] as const satisfies readonly (keyof UsageCounts)[];
const STATUS_CLASS: Record<ModelStatus, string> = { ok: "text-green-700", missing: "text-red-700", unknown: "text-slate-600" };
const FREE_SUFFIX = /:free$/i;

/** Elenco con il modello in index spostato di un posto (delta -1 su, +1 giù). */
function moved(models: string[], index: number, delta: number): string[] {
  const next = [...models];
  [next[index], next[index + delta]] = [next[index + delta], next[index]];
  return next;
}

/**
 * Uso dei modelli in una finestra (T-3902): una riga per modello con richieste, riuscite, fornitore occupato, limite
 * giornaliero dell'account, altri esiti e durata media delle riuscite.
 */
function UsageTable({ usage, window }: { usage: AiUsage; window: (typeof USAGE_WINDOWS)[number] }) {
  const t = useTranslations("admin.aiTitles.usage");
  const format = useFormatter();
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-left text-sm tabular-nums">
        <caption className="pb-1 text-left text-xs font-medium text-slate-600">{t(`window.${window}`)}</caption>
        <thead>
          <tr className="border-b border-[var(--surface-border)] text-xs text-slate-600">
            <th scope="col" className="py-1 pr-3 font-medium">
              {t("model")}
            </th>
            {USAGE_COLUMNS.map((column) => (
              <th key={column} scope="col" className="py-1 pr-3 text-right font-medium">
                {t(`columns.${column}`)}
              </th>
            ))}
            <th scope="col" className="py-1 text-right font-medium">
              {t("columns.avgOkMs")}
            </th>
          </tr>
        </thead>
        <tbody>
          {usage.models.map((entry) => {
            const counts = entry[window];
            return (
              <tr key={entry.model} className="border-b border-[var(--surface-border)] last:border-0">
                <th scope="row" className="break-all py-1 pr-3 font-normal">
                  {entry.model}
                </th>
                {USAGE_COLUMNS.map((column) => (
                  <td key={column} className="py-1 pr-3 text-right">
                    {format.number(counts[column])}
                  </td>
                ))}
                <td className="py-1 text-right">
                  {counts.avgOkMs === null ? "—" : t("seconds", { seconds: format.number(counts.avgOkMs / 1000, { maximumFractionDigits: 1 }) })}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

/** Interruttore acceso/spento con la sua etichetta (titoli e articoli). */
function SwitchRow({ id, label, on, disabled, onToggle }: { id: string; label: string; on: boolean; disabled: boolean; onToggle: () => void }) {
  const t = useTranslations("admin.aiTitles");
  return (
    <div className="flex flex-wrap items-center gap-3">
      <span id={id} className="text-sm font-medium">
        {label}
      </span>
      <button type="button" role="switch" aria-checked={on} aria-labelledby={id} className={on ? "btn-primary" : "btn-secondary"} disabled={disabled} onClick={onToggle}>
        {on ? t("on") : t("off")}
      </button>
    </div>
  );
}

/**
 * Titoli con l'AI nelle Impostazioni del root admin (T-3501, D-42): interruttore, elenco ordinato dei modelli gratuiti
 * (T-3801) con «Su», «Giù», «Togli» e «Aggiungi modello», stato di ogni modello sul catalogo di OpenRouter con la data
 * dell'ultimo controllo e i modelli gratuiti nuovi da aggiungere (T-3803), tetto della piattaforma in richieste e limite
 * per workspace in proposte, con lo stato della chiave (solo sì o no), le richieste delle ultime 24 ore contate dal tetto
 * e la tabella «Uso dei modelli» sulle ultime 24 ore e sugli ultimi 7 giorni (T-3902); in fondo gli articoli con
 * l'AI (T-4002) con il loro interruttore e i limiti per workspace in articoli e in sezioni riscritte. All'apertura il
 * catalogo si rilegge se ha più di un'ora. Il salvataggio manda interruttori, elenco e limiti; la rotta riverifica
 * ruolo, modelli e limiti.
 */
export function AiTitlesSettingsCard({ initial }: { initial: AiTitlesView }) {
  const t = useTranslations("admin.aiTitles");
  const format = useFormatter();
  const listId = useId();
  const [view, setView] = useState(initial);
  const [enabled, setEnabled] = useState(initial.enabled);
  const [articlesEnabled, setArticlesEnabled] = useState(initial.articlesEnabled);
  const [models, setModels] = useState(initial.models);
  const [candidate, setCandidate] = useState("");
  const [candidateError, setCandidateError] = useState<string | null>(null);
  const [limits, setLimits] = useState(
    () => Object.fromEntries([...TITLE_LIMITS, ...ARTICLE_LIMITS].map((field) => [field, String(initial[field])])) as Record<LimitField, string>
  );
  const { saving, error, success, save } = useSaveAction();

  useEffect(() => {
    if (!isCatalogStale(initial.catalog, Date.now())) return;
    let active = true;
    void refreshCatalog().then((data) => {
      if (active && data) setView(data);
    });
    return () => {
      active = false;
    };
  }, [initial.catalog]);

  const full = models.length >= MAX_MODELS;

  const limitInputs = (fields: LimitField[]) => (
    <div className="grid gap-3 md:grid-cols-2">
      {fields.map((field) => (
        <div key={field}>
          <label className="label" htmlFor={`ai-titles-${field}`}>
            {t(LIMIT_LABELS[field])}
          </label>
          <input
            id={`ai-titles-${field}`}
            className="input"
            type="number"
            min={1}
            max={AI_LIMIT_MAX[field]}
            value={limits[field]}
            onChange={(event) => setLimits((current) => ({ ...current, [field]: event.target.value }))}
          />
        </div>
      ))}
    </div>
  );
  const addable = addableModels(models, view.catalog);

  const add = (id: string): boolean => {
    if (full) return false;
    setModels((current) => [...current, id]);
    return true;
  };

  const addCandidate = () => {
    const id = candidate.trim();
    if (!id) return;
    if (!FREE_SUFFIX.test(id)) {
      setCandidateError(t("notFree"));
    } else if (models.some((model) => sameModel(model, id))) {
      setCandidateError(t("duplicate"));
    } else if (add(id)) {
      setCandidate("");
      setCandidateError(null);
    }
  };

  const submit = () =>
    save(async (tErrors) => {
      const payload = await saveAiTitles(
        {
          enabled,
          models,
          articlesEnabled,
          ...(Object.fromEntries(Object.entries(limits).map(([field, value]) => [field, Number(value)])) as Record<LimitField, number>),
        },
        tErrors
      );
      if (payload?.data) {
        setView(payload.data);
      }
      return t("saved");
    });

  return (
    <SettingsCard
      id="ai-titles"
      title={t("title")}
      intro={t("intro")}
      error={error}
      success={success}
      save={{ onClick: submit, pending: saving, label: t("save"), pendingLabel: t("saving") }}
    >
      <SwitchRow id="ai-titles-enabled" label={t("enabled")} on={enabled} disabled={saving} onToggle={() => setEnabled((value) => !value)} />

      <div className="space-y-2">
        <p id={`${listId}-label`} className="label">
          {t("models")}
        </p>
        <p id={`${listId}-hint`} className="text-xs text-slate-500">
          {t("modelsHint")}
        </p>
        <ol aria-labelledby={`${listId}-label`} aria-describedby={`${listId}-hint`} className="space-y-1.5">
          {models.map((id, index) => {
            const status = modelStatus(id, view.catalog);
            const nameId = `${listId}-model-${index}`;
            return (
              <li key={id} className="flex flex-wrap items-center gap-2 text-sm">
                <span className="w-5 text-right tabular-nums text-slate-500" aria-hidden="true">
                  {index + 1}.
                </span>
                <span id={nameId} className="break-all font-medium">
                  {id}
                </span>
                <span className={`text-xs ${STATUS_CLASS[status]}`}>{t(`status.${status}`)}</span>
                <span className="ml-auto flex gap-1">
                  <button
                    type="button"
                    className="btn-secondary btn-compact"
                    aria-describedby={nameId}
                    disabled={saving || index === 0}
                    onClick={() => setModels((current) => moved(current, index, -1))}
                  >
                    {t("up")}
                  </button>
                  <button
                    type="button"
                    className="btn-secondary btn-compact"
                    aria-describedby={nameId}
                    disabled={saving || index === models.length - 1}
                    onClick={() => setModels((current) => moved(current, index, 1))}
                  >
                    {t("down")}
                  </button>
                  <button
                    type="button"
                    className="btn-secondary btn-compact"
                    aria-describedby={nameId}
                    disabled={saving || models.length === 1}
                    onClick={() => setModels((current) => current.filter((_, position) => position !== index))}
                  >
                    {t("remove")}
                  </button>
                </span>
              </li>
            );
          })}
        </ol>

        <label className="label" htmlFor={`${listId}-add`}>
          {t("addModel")}
        </label>
        <div className="flex flex-wrap gap-2">
          <input
            id={`${listId}-add`}
            className="input min-w-0 flex-1"
            value={candidate}
            onChange={(event) => {
              setCandidate(event.target.value);
              setCandidateError(null);
            }}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.preventDefault();
                addCandidate();
              }
            }}
            aria-describedby={`${listId}-add-hint`}
            aria-invalid={candidateError !== null}
            spellCheck={false}
            disabled={saving || full}
          />
          <button type="button" className="btn-secondary" disabled={saving || full || !candidate.trim()} onClick={addCandidate}>
            {t("add")}
          </button>
        </div>
        <p id={`${listId}-add-hint`} className={`text-xs ${candidateError ? "text-red-700" : "text-slate-500"}`} role={candidateError ? "alert" : undefined}>
          {candidateError ?? (full ? t("full") : "")}
        </p>
      </div>

      <div className="space-y-2 text-sm">
        <p className="text-slate-600">
          {view.catalog ? t("catalogChecked", { date: formatDate(view.catalog.checkedAt, format) }) : t("catalogNever")}
        </p>
        {view.catalog && (
          <>
            <p className="font-medium">{t("catalogNew")}</p>
            {addable.length === 0 ? (
              <p className="text-slate-600">{t("catalogNoNew")}</p>
            ) : (
              <ul className="space-y-1.5">
                {addable.map((entry) => (
                  <li key={entry.id} className="flex flex-wrap items-center gap-2">
                    <span id={`${listId}-new-${entry.id}`} className="break-all">
                      {entry.id}
                    </span>
                    <button
                      type="button"
                      className="btn-secondary btn-compact ml-auto"
                      aria-describedby={`${listId}-new-${entry.id}`}
                      disabled={saving || full}
                      onClick={() => add(entry.id)}
                    >
                      {t("add")}
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </>
        )}
      </div>

      {limitInputs(TITLE_LIMITS)}

      <ul className="space-y-1 text-sm text-slate-600">
        <li>{t("keyConfigured", { configured: view.keyConfigured ? "yes" : "no" })}</li>
        <li>{t("used", { used: view.usage.requests24h, limit: view.usage.limit })}</li>
      </ul>

      <div className="space-y-2">
        <h3 className="text-sm font-medium">{t("usage.title")}</h3>
        {view.usage.models.length === 0 ? (
          <p className="text-sm text-slate-600">{t("usage.empty")}</p>
        ) : (
          USAGE_WINDOWS.map((window) => <UsageTable key={window} usage={view.usage} window={window} />)
        )}
      </div>

      <div className="space-y-3 border-t border-[var(--surface-border)] pt-4">
        <h3 className="text-sm font-medium">{t("articlesTitle")}</h3>
        <p className="text-sm text-slate-600">{t("articlesIntro")}</p>
        <SwitchRow
          id="ai-articles-enabled"
          label={t("articlesEnabled")}
          on={articlesEnabled}
          disabled={saving}
          onToggle={() => setArticlesEnabled((value) => !value)}
        />
        {limitInputs(ARTICLE_LIMITS)}
      </div>
    </SettingsCard>
  );
}
