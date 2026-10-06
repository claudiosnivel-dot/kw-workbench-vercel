"use client";

import type { MetricsProvider } from "@/lib/generated/prisma/enums";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { ApiErrorPayload, readApiResponse } from "@/lib/client/http";
import { useLocaleOptions } from "@/lib/client/use-locale-options";
import { isSupportedCountryCode, isSupportedLanguageCode } from "@/lib/constants/locale-options";

type BooleanOverride = "inherit" | "true" | "false";

type SubprojectFormValues = {
  name: string;
  description: string;
  seeds: string;
  language_code_override: string;
  country_code_override: string;
  autocomplete_provider_override: "" | "MOCK" | "GOOGLE_DIRECT";
  metrics_provider_override: "" | MetricsProvider;
  min_volume_override: string;
  exclude_brands_override: BooleanOverride;
  expand_alpha_override: BooleanOverride;
  expand_numeric_override: BooleanOverride;
  expand_patterns_override: BooleanOverride;
  auto_classification_override: BooleanOverride;
  scoring_profile_override: string;
};

type BooleanOverrideKey =
  | "exclude_brands_override"
  | "expand_alpha_override"
  | "expand_numeric_override"
  | "expand_patterns_override"
  | "auto_classification_override";

type SubprojectFormResponse = ApiErrorPayload & {
  data?: {
    id?: string;
  };
};

type SubprojectFormProps = {
  mode: "create" | "edit";
  projectId: string;
  subprojectId?: string;
  initialValues?: Partial<SubprojectFormValues>;
  canEditAutocompleteProvider?: boolean;
  showAdvanced?: boolean;
  redirectTo?: string | null;
  submitLabel?: string;
};

const defaultValues: SubprojectFormValues = {
  name: "",
  description: "",
  seeds: "",
  language_code_override: "",
  country_code_override: "",
  autocomplete_provider_override: "",
  metrics_provider_override: "",
  min_volume_override: "",
  exclude_brands_override: "inherit",
  expand_alpha_override: "inherit",
  expand_numeric_override: "inherit",
  expand_patterns_override: "inherit",
  auto_classification_override: "inherit",
  scoring_profile_override: "",
};

// Override booleani: campo del form, id del select e chiave dell'etichetta nel catalogo.
const BOOLEAN_OVERRIDES = [
  { key: "exclude_brands_override", id: "subproject-exclude-brands-override", label: "excludeBrandsOverride" },
  { key: "expand_alpha_override", id: "subproject-expand-alpha-override", label: "expandAlphaOverride" },
  { key: "expand_numeric_override", id: "subproject-expand-numeric-override", label: "expandNumericOverride" },
  { key: "expand_patterns_override", id: "subproject-expand-patterns-override", label: "expandPatternsOverride" },
  { key: "auto_classification_override", id: "subproject-auto-classification-override", label: "autoClassificationOverride" },
] as const satisfies ReadonlyArray<{ key: BooleanOverrideKey; id: string; label: string }>;

function parseBooleanOverride(value: BooleanOverride): boolean | null {
  if (value === "true") {
    return true;
  }

  if (value === "false") {
    return false;
  }

  return null;
}

function parseNonNegativeNumber(value: string): number | null {
  const trimmed = value.trim();
  if (!trimmed) {
    return null;
  }

  const parsed = Number(trimmed);
  if (!Number.isFinite(parsed)) {
    return null;
  }

  return Math.max(0, Math.trunc(parsed));
}

export function SubprojectForm({
  mode,
  projectId,
  subprojectId,
  initialValues,
  canEditAutocompleteProvider = false,
  showAdvanced = true,
  redirectTo = null,
  submitLabel,
}: SubprojectFormProps) {
  const t = useTranslations("sections.form");
  const tErrors = useTranslations("errors");
  const tFields = useTranslations("projects.fields");
  const tProject = useTranslations("projects.form");
  const tCommon = useTranslations("common");
  const router = useRouter();
  const initialFormValues: SubprojectFormValues = { ...defaultValues, ...initialValues };
  const [values, setValues] = useState<SubprojectFormValues>(initialFormValues);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const { languageOptions, countryOptions } = useLocaleOptions();

  const hasCustomLanguage = values.language_code_override
    ? !isSupportedLanguageCode(values.language_code_override)
    : false;

  const hasCustomCountry = values.country_code_override
    ? !isSupportedCountryCode(values.country_code_override)
    : false;

  const update = <K extends keyof SubprojectFormValues>(key: K, value: SubprojectFormValues[K]) => {
    setValues((current) => ({ ...current, [key]: value }));
  };

  const endpoint = mode === "create" ? `/api/projects/${projectId}/subprojects` : `/api/projects/${projectId}/subprojects/${subprojectId}`;
  const method = mode === "create" ? "POST" : "PATCH";

  const submit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSaving(true);
    setMessage(null);
    setError(null);

    const payload = {
      name: values.name,
      description: values.description.trim() || null,
      seeds: values.seeds,
      language_code_override: values.language_code_override.trim() || null,
      country_code_override: values.country_code_override.trim() || null,
      autocomplete_provider_override: canEditAutocompleteProvider ? values.autocomplete_provider_override || null : null,
      metrics_provider_override: values.metrics_provider_override || null,
      min_volume_override: parseNonNegativeNumber(values.min_volume_override),
      exclude_brands_override: parseBooleanOverride(values.exclude_brands_override),
      expand_alpha_override: parseBooleanOverride(values.expand_alpha_override),
      expand_numeric_override: parseBooleanOverride(values.expand_numeric_override),
      expand_patterns_override: parseBooleanOverride(values.expand_patterns_override),
      auto_classification_override: parseBooleanOverride(values.auto_classification_override),
      scoring_profile_override: values.scoring_profile_override.trim() || null,
    };

    try {
      const response = await fetch(endpoint, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const json = await readApiResponse<SubprojectFormResponse>(response, tErrors);

      if (mode === "create" && redirectTo && json?.data?.id) {
        router.push(redirectTo.replace(":subprojectId", json.data.id));
        router.refresh();
        return;
      }

      if (mode === "create") {
        setValues(initialFormValues);
      }
      setMessage(t("saved"));
      router.refresh();
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : tCommon("unexpectedError"));
    } finally {
      setSaving(false);
    }
  };

  return (
    <form className="space-y-6" onSubmit={submit}>
      <div className="grid gap-4 md:grid-cols-2">
        <div>
          <label className="label" htmlFor="subproject-name">
            {t("name")}
          </label>
          <input
            id="subproject-name"
            className="input"
            value={values.name}
            onChange={(event) => update("name", event.target.value)}
            required
          />
          <p className="mt-1 text-xs text-slate-500">{t("nameHint")}</p>
        </div>

        <div>
          <label className="label" htmlFor="subproject-description">
            {t("description")}
          </label>
          <input
            id="subproject-description"
            className="input"
            value={values.description}
            onChange={(event) => update("description", event.target.value)}
            placeholder={t("descriptionPlaceholder")}
          />
          <p className="mt-1 text-xs text-slate-500">{t("descriptionHint")}</p>
        </div>
      </div>

      <div>
        <label className="label" htmlFor="subproject-seeds">
          {t("seeds")}
        </label>
        <textarea
          id="subproject-seeds"
          className="input min-h-40"
          value={values.seeds}
          onChange={(event) => update("seeds", event.target.value)}
          placeholder={tProject("seedsPlaceholder")}
        />
        <p className="mt-1 text-xs text-slate-500">{t("seedsHint")}</p>
      </div>

      {showAdvanced && (
        <section className="space-y-4 rounded-2xl border border-[var(--surface-border)] bg-[var(--surface-muted)] p-4">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">{t("overridesTitle")}</h2>

          <div className="grid gap-4 md:grid-cols-2">
            <div>
              <label className="label" htmlFor="subproject-language-override">
                {t("languageOverride")}
              </label>
              <select
                id="subproject-language-override"
                className="select"
                value={values.language_code_override}
                onChange={(event) => update("language_code_override", event.target.value)}
              >
                <option value="">{t("useProjectDefault")}</option>
                {hasCustomLanguage && (
                  <option value={values.language_code_override}>
                    {tFields("customCode", { code: values.language_code_override })}
                  </option>
                )}
                {languageOptions.map((option) => (
                  <option key={option.code} value={option.code}>
                    {option.label}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="label" htmlFor="subproject-country-override">
                {t("countryOverride")}
              </label>
              <select
                id="subproject-country-override"
                className="select"
                value={values.country_code_override}
                onChange={(event) => update("country_code_override", event.target.value)}
              >
                <option value="">{t("useProjectDefault")}</option>
                {hasCustomCountry && (
                  <option value={values.country_code_override}>
                    {tFields("customCode", { code: values.country_code_override })}
                  </option>
                )}
                {countryOptions.map((option) => (
                  <option key={option.code} value={option.code}>
                    {option.label}
                  </option>
                ))}
              </select>
            </div>

            {canEditAutocompleteProvider && (
              <div>
                <label className="label" htmlFor="subproject-autocomplete-override">
                  {t("autocompleteOverride")}
                </label>
                <select
                  id="subproject-autocomplete-override"
                  className="select"
                  value={values.autocomplete_provider_override}
                  onChange={(event) =>
                    update("autocomplete_provider_override", event.target.value as SubprojectFormValues["autocomplete_provider_override"])
                  }
                >
                  <option value="">{t("useProjectDefault")}</option>
                  <option value="GOOGLE_DIRECT">{t("providers.googleDirect")}</option>
                  <option value="MOCK">{t("providers.mockAutocomplete")}</option>
                </select>
              </div>
            )}

            <div>
              <label className="label" htmlFor="subproject-metrics-override">
                {t("metricsOverride")}
              </label>
              <select
                id="subproject-metrics-override"
                className="select"
                value={values.metrics_provider_override}
                onChange={(event) =>
                  update("metrics_provider_override", event.target.value as SubprojectFormValues["metrics_provider_override"])
                }
              >
                <option value="">{t("useProjectDefault")}</option>
                <option value="NONE">{t("providers.noMetrics")}</option>
                <option value="MOCK">{t("providers.mockMetrics")}</option>
                {/* A pagamento (T-902): solo il root admin, o la sezione che lo ha già. */}
                {(canEditAutocompleteProvider || initialValues?.metrics_provider_override === "DATAFORSEO") && (
                  <option value="DATAFORSEO">{tFields("dataForSeo")}</option>
                )}
              </select>
            </div>

            <div>
              <label className="label" htmlFor="subproject-min-volume-override">
                {t("minVolumeOverride")}
              </label>
              <input
                id="subproject-min-volume-override"
                className="input"
                type="number"
                min={0}
                value={values.min_volume_override}
                onChange={(event) => update("min_volume_override", event.target.value)}
                placeholder={t("useProjectDefault")}
              />
            </div>

            <div>
              <label className="label" htmlFor="subproject-scoring-override">
                {t("scoringOverride")}
              </label>
              <select
                id="subproject-scoring-override"
                className="select"
                value={values.scoring_profile_override}
                onChange={(event) => update("scoring_profile_override", event.target.value)}
              >
                <option value="">{t("useProjectDefault")}</option>
                <option value="balanced">{tFields("scoring.balanced")}</option>
                <option value="aggressive">{tFields("scoring.aggressive")}</option>
                <option value="conservative">{tFields("scoring.conservative")}</option>
              </select>
            </div>
          </div>

          <div className="grid gap-3 md:grid-cols-2">
            {BOOLEAN_OVERRIDES.map((field) => (
              <div key={field.key} className={field.key === "auto_classification_override" ? "md:col-span-2" : undefined}>
                <label className="label" htmlFor={field.id}>
                  {t(field.label)}
                </label>
                <select
                  id={field.id}
                  className="select"
                  value={values[field.key]}
                  onChange={(event) => update(field.key, event.target.value as BooleanOverride)}
                >
                  <option value="inherit">{t("useProjectDefault")}</option>
                  <option value="true">{t("on")}</option>
                  <option value="false">{t("off")}</option>
                </select>
              </div>
            ))}
          </div>
        </section>
      )}

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:flex-wrap">
        <button className="btn-primary w-full sm:w-auto" disabled={saving} type="submit">
          {saving ? tCommon("saving") : (submitLabel ?? (mode === "create" ? t("create") : t("save")))}
        </button>
        {message && <p className="text-sm text-green-700">{message}</p>}
        {error && <p className="text-sm text-red-700">{error}</p>}
      </div>
    </form>
  );
}
