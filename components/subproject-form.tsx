"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { ApiErrorPayload, buildApiErrorMessage, readJsonSafe } from "@/lib/client/http";
import {
  COUNTRY_CODES,
  LANGUAGE_OPTIONS,
  isSupportedCountryCode,
  isSupportedLanguageCode,
} from "@/lib/constants/locale-options";

type BooleanOverride = "inherit" | "true" | "false";

type SubprojectFormValues = {
  name: string;
  description: string;
  seeds: string;
  language_code_override: string;
  country_code_override: string;
  autocomplete_provider_override: "" | "MOCK" | "GOOGLE_DIRECT";
  metrics_provider_override: "" | "NONE" | "MOCK" | "GOOGLE_KEYWORD_PLANNER";
  min_volume_override: string;
  exclude_brands_override: BooleanOverride;
  expand_alpha_override: BooleanOverride;
  expand_numeric_override: BooleanOverride;
  expand_patterns_override: BooleanOverride;
  auto_classification_override: BooleanOverride;
  scoring_profile_override: string;
};

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
  const router = useRouter();
  const [values, setValues] = useState<SubprojectFormValues>({
    ...defaultValues,
    ...initialValues,
  });
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const regionNames = useMemo(() => {
    try {
      return new Intl.DisplayNames(["it"], { type: "region" });
    } catch {
      return null;
    }
  }, []);

  const countryOptions = useMemo(
    () =>
      COUNTRY_CODES.map((code) => {
        const name = regionNames?.of(code) ?? code;
        return {
          code,
          label: `${name} (${code})`,
        };
      }),
    [regionNames]
  );

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

      const json = await readJsonSafe<SubprojectFormResponse>(response);
      if (!response.ok) {
        throw new Error(buildApiErrorMessage(response, json, "Impossibile salvare la sezione"));
      }

      if (mode === "create" && redirectTo && json?.data?.id) {
        router.push(redirectTo.replace(":subprojectId", json.data.id));
        router.refresh();
        return;
      }

      setMessage("Sezione salvata.");
      router.refresh();
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : "Errore imprevisto");
    } finally {
      setSaving(false);
    }
  };

  return (
    <form className="space-y-6" onSubmit={submit}>
      <div className="grid gap-4 md:grid-cols-2">
        <div>
          <label className="label" htmlFor="subproject-name">
            Nome sezione
          </label>
          <input
            id="subproject-name"
            className="input"
            value={values.name}
            onChange={(event) => update("name", event.target.value)}
            required
          />
          <p className="mt-1 text-xs text-slate-500">Nome libero (es. categoria, cluster, funnel o qualsiasi logica operativa).</p>
        </div>

        <div>
          <label className="label" htmlFor="subproject-description">
            Descrizione (opzionale)
          </label>
          <input
            id="subproject-description"
            className="input"
            value={values.description}
            onChange={(event) => update("description", event.target.value)}
            placeholder="Nota interna"
          />
          <p className="mt-1 text-xs text-slate-500">Aiuta a distinguere le sezioni quando diventano numerosi.</p>
        </div>
      </div>

      <div>
        <label className="label" htmlFor="subproject-seeds">
          Keyword seed (una per riga, supportate anche virgole e punto e virgola)
        </label>
        <textarea
          id="subproject-seeds"
          className="input min-h-40"
          value={values.seeds}
          onChange={(event) => update("seeds", event.target.value)}
          placeholder="keyword uno\nkeyword due\nkeyword tre"
        />
        <p className="mt-1 text-xs text-slate-500">Seed specifiche della sezione. L'estrazione agira solo su queste keyword iniziali.</p>
      </div>

      {showAdvanced && (
        <section className="space-y-4 rounded-2xl border border-[var(--surface-border)] bg-[var(--surface-muted)] p-4">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">Override impostazioni (opzionale)</h2>

          <div className="grid gap-4 md:grid-cols-2">
            <div>
              <label className="label" htmlFor="subproject-language-override">
                Lingua override
              </label>
              <select
                id="subproject-language-override"
                className="select"
                value={values.language_code_override}
                onChange={(event) => update("language_code_override", event.target.value)}
              >
                <option value="">Usa default progetto</option>
                {hasCustomLanguage && (
                  <option value={values.language_code_override}>Codice attuale non standard ({values.language_code_override})</option>
                )}
                {LANGUAGE_OPTIONS.map((option) => (
                  <option key={option.code} value={option.code}>
                    {option.label} ({option.code})
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="label" htmlFor="subproject-country-override">
                Paese override
              </label>
              <select
                id="subproject-country-override"
                className="select"
                value={values.country_code_override}
                onChange={(event) => update("country_code_override", event.target.value)}
              >
                <option value="">Usa default progetto</option>
                {hasCustomCountry && (
                  <option value={values.country_code_override}>Codice attuale non standard ({values.country_code_override})</option>
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
                  Provider autocomplete override
                </label>
                <select
                  id="subproject-autocomplete-override"
                  className="select"
                  value={values.autocomplete_provider_override}
                  onChange={(event) =>
                    update("autocomplete_provider_override", event.target.value as SubprojectFormValues["autocomplete_provider_override"])
                  }
                >
                  <option value="">Usa default progetto</option>
                  <option value="GOOGLE_DIRECT">GoogleDirectAutocompleteProvider</option>
                  <option value="MOCK">MockAutocompleteProvider</option>
                </select>
              </div>
            )}

            <div>
              <label className="label" htmlFor="subproject-metrics-override">
                Provider metriche override
              </label>
              <select
                id="subproject-metrics-override"
                className="select"
                value={values.metrics_provider_override}
                onChange={(event) =>
                  update("metrics_provider_override", event.target.value as SubprojectFormValues["metrics_provider_override"])
                }
              >
                <option value="">Usa default progetto</option>
                <option value="NONE">NoMetricsProvider</option>
                <option value="MOCK">MockMetricsProvider</option>
                <option value="GOOGLE_KEYWORD_PLANNER">GoogleKeywordPlannerMetricsProvider</option>
              </select>
            </div>

            <div>
              <label className="label" htmlFor="subproject-min-volume-override">
                Volume minimo override
              </label>
              <input
                id="subproject-min-volume-override"
                className="input"
                type="number"
                min={0}
                value={values.min_volume_override}
                onChange={(event) => update("min_volume_override", event.target.value)}
                placeholder="Usa default progetto"
              />
            </div>

            <div>
              <label className="label" htmlFor="subproject-scoring-override">
                Profilo scoring override
              </label>
              <select
                id="subproject-scoring-override"
                className="select"
                value={values.scoring_profile_override}
                onChange={(event) => update("scoring_profile_override", event.target.value)}
              >
                <option value="">Usa default progetto</option>
                <option value="balanced">bilanciato</option>
                <option value="aggressive">aggressivo</option>
                <option value="conservative">conservativo</option>
              </select>
            </div>
          </div>

          <div className="grid gap-3 md:grid-cols-2">
            <div>
              <label className="label" htmlFor="subproject-exclude-brands-override">
                Escludi brand override
              </label>
              <select
                id="subproject-exclude-brands-override"
                className="select"
                value={values.exclude_brands_override}
                onChange={(event) =>
                  update("exclude_brands_override", event.target.value as SubprojectFormValues["exclude_brands_override"])
                }
              >
                <option value="inherit">Usa default progetto</option>
                <option value="true">Attivo</option>
                <option value="false">Disattivo</option>
              </select>
            </div>

            <div>
              <label className="label" htmlFor="subproject-expand-alpha-override">
                Espansione alfabeto override
              </label>
              <select
                id="subproject-expand-alpha-override"
                className="select"
                value={values.expand_alpha_override}
                onChange={(event) =>
                  update("expand_alpha_override", event.target.value as SubprojectFormValues["expand_alpha_override"])
                }
              >
                <option value="inherit">Usa default progetto</option>
                <option value="true">Attivo</option>
                <option value="false">Disattivo</option>
              </select>
            </div>

            <div>
              <label className="label" htmlFor="subproject-expand-numeric-override">
                Espansione numerica override
              </label>
              <select
                id="subproject-expand-numeric-override"
                className="select"
                value={values.expand_numeric_override}
                onChange={(event) =>
                  update("expand_numeric_override", event.target.value as SubprojectFormValues["expand_numeric_override"])
                }
              >
                <option value="inherit">Usa default progetto</option>
                <option value="true">Attivo</option>
                <option value="false">Disattivo</option>
              </select>
            </div>

            <div>
              <label className="label" htmlFor="subproject-expand-patterns-override">
                Espansione pattern override
              </label>
              <select
                id="subproject-expand-patterns-override"
                className="select"
                value={values.expand_patterns_override}
                onChange={(event) =>
                  update("expand_patterns_override", event.target.value as SubprojectFormValues["expand_patterns_override"])
                }
              >
                <option value="inherit">Usa default progetto</option>
                <option value="true">Attivo</option>
                <option value="false">Disattivo</option>
              </select>
            </div>

            <div className="md:col-span-2">
              <label className="label" htmlFor="subproject-auto-classification-override">
                Classificazione automatica override
              </label>
              <select
                id="subproject-auto-classification-override"
                className="select"
                value={values.auto_classification_override}
                onChange={(event) =>
                  update(
                    "auto_classification_override",
                    event.target.value as SubprojectFormValues["auto_classification_override"]
                  )
                }
              >
                <option value="inherit">Usa default progetto</option>
                <option value="true">Attivo</option>
                <option value="false">Disattivo</option>
              </select>
            </div>
          </div>
        </section>
      )}

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:flex-wrap">
        <button className="btn-primary w-full sm:w-auto" disabled={saving} type="submit">
          {saving ? "Salvataggio..." : (submitLabel ?? (mode === "create" ? "Crea sezione" : "Salva sezione"))}
        </button>
        {message && <p className="text-sm text-green-700">{message}</p>}
        {error && <p className="text-sm text-red-700">{error}</p>}
      </div>
    </form>
  );
}



