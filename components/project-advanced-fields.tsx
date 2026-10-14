"use client";

import { useTranslations } from "next-intl";
import type { ReactNode } from "react";
import type { MetricsProvider } from "@/lib/generated/prisma/enums";

/** Valori delle impostazioni del progetto (T-2602): il blocco «Il progetto» e le Avanzate. */
export type ProjectSettingsValues = {
  name: string;
  language_code: string;
  country_code: string;
  autocomplete_provider: "MOCK" | "GOOGLE_DIRECT";
  // Tipo dell'enum: PLANNER_CSV (T-910) marca le righe importate e non è tra le opzioni del form.
  metrics_provider: MetricsProvider;
  min_volume: number;
  exclude_brands: boolean;
  expand_alpha: boolean;
  expand_numeric: boolean;
  expand_patterns: boolean;
  auto_classification: boolean;
  scoring_profile: string;
};

/**
 * Parametri sì/no delle Avanzate, con la chiave dell'etichetta nel catalogo (projects.fields); depth segna la profondità
 * della ricerca (lettere, numeri, modelli).
 */
export const BOOLEAN_SETTINGS = [
  { field: "exclude_brands", label: "excludeBrands", depth: false },
  { field: "auto_classification", label: "autoClassification", depth: false },
  { field: "expand_alpha", label: "expandAlpha", depth: true },
  { field: "expand_numeric", label: "expandNumeric", depth: true },
  { field: "expand_patterns", label: "expandPatterns", depth: true },
] as const;

type ChoiceKind = "autocomplete" | "metrics" | "scoring";

/** Etichetta, controllo e riga di spiegazione di un parametro (T-2602), uguale nelle Avanzate e nel dialogo dell'argomento. */
export function SettingField({ id, label, hint, children }: { id: string; label: string; hint?: string; children: ReactNode }) {
  return (
    <div>
      <label className="label" htmlFor={id}>
        {label}
      </label>
      {children}
      {hint && <p className="mt-1 text-xs text-slate-500">{hint}</p>}
    </div>
  );
}

/**
 * Opzioni di un parametro a scelta: fonte dei suggerimenti, volumi di ricerca, profilo del punteggio. DataForSEO ha un
 * costo per richiesta: compare solo a chi lo può scegliere o a chi lo ha già (T-902).
 */
export function ChoiceOptions({ kind, showLicensedProvider = false }: { kind: ChoiceKind; showLicensedProvider?: boolean }) {
  const t = useTranslations("projects.fields");
  if (kind === "autocomplete") {
    return (
      <>
        <option value="GOOGLE_DIRECT">{t("autocompleteGoogle")}</option>
        <option value="MOCK">{t("autocompleteMock")}</option>
      </>
    );
  }
  if (kind === "metrics") {
    return (
      <>
        <option value="NONE">{t("metricsNone")}</option>
        <option value="MOCK">{t("metricsMock")}</option>
        {showLicensedProvider && <option value="DATAFORSEO">{t("dataForSeo")}</option>}
      </>
    );
  }
  return (
    <>
      <option value="balanced">{t("scoring.balanced")}</option>
      <option value="aggressive">{t("scoring.aggressive")}</option>
      <option value="conservative">{t("scoring.conservative")}</option>
    </>
  );
}

type AdvancedProjectFieldsProps = {
  values: ProjectSettingsValues;
  update: <K extends keyof ProjectSettingsValues>(key: K, value: ProjectSettingsValues[K]) => void;
  canEditAutocompleteProvider: boolean;
  showLicensedProvider: boolean;
};

/**
 * Parametri tecnici del progetto nel blocco Avanzate (T-2602): fonte dei suggerimenti (solo per il root admin), volumi
 * di ricerca, volume minimo, profilo del punteggio e i parametri sì/no, ciascuno con una riga di spiegazione.
 */
export function AdvancedProjectFields({ values, update, canEditAutocompleteProvider, showLicensedProvider }: AdvancedProjectFieldsProps) {
  const t = useTranslations("projects.fields");
  const toggle = ({ field, label }: (typeof BOOLEAN_SETTINGS)[number]) => (
    <div key={field}>
      <label className="flex items-center gap-2 text-sm font-medium">
        <input type="checkbox" checked={values[field]} onChange={(event) => update(field, event.target.checked)} />
        {t(label)}
      </label>
      <p className="mt-1 text-xs text-slate-500">{t(`${label}Hint`)}</p>
    </div>
  );

  return (
    <>
      <div className="grid gap-4 md:grid-cols-2">
        {canEditAutocompleteProvider && (
          <SettingField id="autocomplete_provider" label={t("autocompleteProvider")} hint={t("autocompleteProviderHint")}>
            <select
              id="autocomplete_provider"
              className="select"
              value={values.autocomplete_provider}
              onChange={(event) => update("autocomplete_provider", event.target.value as ProjectSettingsValues["autocomplete_provider"])}
            >
              <ChoiceOptions kind="autocomplete" />
            </select>
          </SettingField>
        )}

        <SettingField id="metrics_provider" label={t("metricsProvider")} hint={t("metricsProviderHint")}>
          <select
            id="metrics_provider"
            className="select"
            value={values.metrics_provider}
            onChange={(event) => update("metrics_provider", event.target.value as ProjectSettingsValues["metrics_provider"])}
          >
            <ChoiceOptions kind="metrics" showLicensedProvider={showLicensedProvider} />
          </select>
        </SettingField>

        <SettingField id="min_volume" label={t("minVolume")} hint={t("minVolumeHint")}>
          <input
            id="min_volume"
            className="input"
            type="number"
            min={0}
            value={values.min_volume}
            onChange={(event) => update("min_volume", Number(event.target.value) || 0)}
          />
        </SettingField>

        <SettingField id="scoring_profile" label={t("scoringProfile")} hint={t("scoringProfileHint")}>
          <select
            id="scoring_profile"
            className="select"
            value={values.scoring_profile}
            onChange={(event) => update("scoring_profile", event.target.value)}
          >
            <ChoiceOptions kind="scoring" />
          </select>
        </SettingField>
      </div>

      <div className="grid gap-3 md:grid-cols-2">{BOOLEAN_SETTINGS.filter((setting) => !setting.depth).map(toggle)}</div>

      <fieldset className="grid gap-3 md:grid-cols-3">
        <legend className="label">{t("searchDepth")}</legend>
        {BOOLEAN_SETTINGS.filter((setting) => setting.depth).map(toggle)}
      </fieldset>
    </>
  );
}
