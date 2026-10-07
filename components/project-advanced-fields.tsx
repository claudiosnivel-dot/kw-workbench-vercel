"use client";

import { useTranslations } from "next-intl";
import { LocaleCodeOptions } from "@/components/locale-code-options";
import type { MetricsProvider } from "@/lib/generated/prisma/enums";

/** Valori del form di progetto (creazione e impostazioni). */
export type ProjectFormValues = {
  name: string;
  language_code: string;
  country_code: string;
  initial_subproject_name: string;
  seeds: string;
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

type AdvancedProjectFieldsProps = {
  values: ProjectFormValues;
  update: <K extends keyof ProjectFormValues>(key: K, value: ProjectFormValues[K]) => void;
  languageValue: string;
  countryValue: string;
  canEditAutocompleteProvider: boolean;
  showLicensedProvider: boolean;
};

// Opzioni booleane del progetto: campo del form e chiavi di etichetta e spiegazione nel catalogo (projects.fields).
const TOGGLE_FIELDS = [
  { field: "exclude_brands", label: "excludeBrands" },
  { field: "expand_alpha", label: "expandAlpha" },
  { field: "expand_numeric", label: "expandNumeric" },
  { field: "expand_patterns", label: "expandPatterns" },
  { field: "auto_classification", label: "autoClassification" },
] as const;

/** Lingua, paese, provider, volume minimo, scoring e opzioni booleane del progetto (T-1302). */
export function AdvancedProjectFields({
  values,
  update,
  languageValue,
  countryValue,
  canEditAutocompleteProvider,
  showLicensedProvider,
}: AdvancedProjectFieldsProps) {
  const t = useTranslations("projects.fields");

  return (
    <>
      <div className="grid gap-4 md:grid-cols-2">
        <div>
          <label className="label" htmlFor="language_code">
            {t("language")}
          </label>
          <select
            id="language_code"
            className="select"
            value={languageValue}
            onChange={(event) => update("language_code", event.target.value)}
            required
          >
            <LocaleCodeOptions kind="language" current={languageValue} />
          </select>
        </div>

        <div>
          <label className="label" htmlFor="country_code">
            {t("country")}
          </label>
          <select
            id="country_code"
            className="select"
            value={countryValue}
            onChange={(event) => update("country_code", event.target.value)}
            required
          >
            <LocaleCodeOptions kind="country" current={countryValue} />
          </select>
        </div>

        {canEditAutocompleteProvider && (
          <div>
            <label className="label" htmlFor="autocomplete_provider">
              {t("autocompleteProvider")}
            </label>
            <select
              id="autocomplete_provider"
              className="select"
              value={values.autocomplete_provider}
              onChange={(event) => update("autocomplete_provider", event.target.value as ProjectFormValues["autocomplete_provider"])}
            >
              <option value="GOOGLE_DIRECT">{t("autocompleteGoogle")}</option>
              <option value="MOCK">{t("mock")}</option>
            </select>
          </div>
        )}

        <div>
          <label className="label" htmlFor="metrics_provider">
            {t("metricsProvider")}
          </label>
          <select
            id="metrics_provider"
            className="select"
            value={values.metrics_provider}
            onChange={(event) => update("metrics_provider", event.target.value as ProjectFormValues["metrics_provider"])}
          >
            <option value="NONE">{t("metricsNone")}</option>
            <option value="MOCK">{t("mock")}</option>
            {showLicensedProvider && <option value="DATAFORSEO">{t("dataForSeo")}</option>}
          </select>
        </div>

        <div>
          <label className="label" htmlFor="min_volume">
            {t("minVolume")}
          </label>
          <input
            id="min_volume"
            className="input"
            type="number"
            min={0}
            value={values.min_volume}
            onChange={(event) => update("min_volume", Number(event.target.value) || 0)}
          />
          <p className="mt-1 text-xs text-slate-500">{t("minVolumeHint")}</p>
        </div>

        <div>
          <label className="label" htmlFor="scoring_profile">
            {t("scoringProfile")}
          </label>
          <select
            id="scoring_profile"
            className="select"
            value={values.scoring_profile}
            onChange={(event) => update("scoring_profile", event.target.value)}
          >
            <option value="balanced">{t("scoring.balanced")}</option>
            <option value="aggressive">{t("scoring.aggressive")}</option>
            <option value="conservative">{t("scoring.conservative")}</option>
          </select>
        </div>
      </div>

      <div className="grid gap-3 md:grid-cols-2">
        {TOGGLE_FIELDS.map(({ field, label }) => (
          <div
            key={field}
            className={`rounded-xl border border-[var(--surface-border)] bg-[var(--surface-background)] p-3${
              field === "auto_classification" ? " md:col-span-2" : ""
            }`}
          >
            <label className="flex items-center gap-2 text-sm font-medium">
              <input type="checkbox" checked={values[field]} onChange={(event) => update(field, event.target.checked)} />
              {t(label)}
            </label>
            <p className="mt-1 text-xs text-slate-500">{t(`${label}Hint`)}</p>
          </div>
        ))}
      </div>
    </>
  );
}
