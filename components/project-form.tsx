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

type ProjectFormValues = {
  name: string;
  language_code: string;
  country_code: string;
  initial_subproject_name: string;
  seeds: string;
  autocomplete_provider: "MOCK" | "GOOGLE_DIRECT";
  metrics_provider: "NONE" | "MOCK" | "GOOGLE_KEYWORD_PLANNER";
  min_volume: number;
  exclude_brands: boolean;
  expand_alpha: boolean;
  expand_numeric: boolean;
  expand_patterns: boolean;
  auto_classification: boolean;
  scoring_profile: string;
};

type ProjectCreateResponse = ApiErrorPayload & {
  data?: {
    project?: { id: string };
    id?: string;
  };
};

type ProjectFormProps = {
  mode: "create" | "edit";
  projectId?: string;
  initialValues?: ProjectFormValues;
  canEditAutocompleteProvider?: boolean;
  showSeeds?: boolean;
  showInitialSubprojectName?: boolean;
};

const defaultValues: ProjectFormValues = {
  name: "",
  language_code: "en",
  country_code: "US",
  initial_subproject_name: "Generale",
  seeds: "",
  autocomplete_provider: "GOOGLE_DIRECT",
  metrics_provider: "NONE",
  min_volume: 0,
  exclude_brands: true,
  expand_alpha: true,
  expand_numeric: true,
  expand_patterns: true,
  auto_classification: true,
  scoring_profile: "balanced",
};

export function ProjectForm({
  mode,
  projectId,
  initialValues,
  canEditAutocompleteProvider = false,
  showSeeds = true,
  showInitialSubprojectName = true,
}: ProjectFormProps) {
  const router = useRouter();
  const [values, setValues] = useState<ProjectFormValues>(() => {
    const base = initialValues ?? defaultValues;
    if (canEditAutocompleteProvider) {
      return base;
    }

    return {
      ...base,
      autocomplete_provider: "GOOGLE_DIRECT",
    };
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

  const languageValue = values.language_code.trim().toLowerCase() || "en";
  const countryValue = values.country_code.trim().toUpperCase() || "US";
  const hasCustomLanguage = !isSupportedLanguageCode(languageValue);
  const hasCustomCountry = !isSupportedCountryCode(countryValue);

  const update = <K extends keyof ProjectFormValues>(key: K, value: ProjectFormValues[K]) => {
    setValues((current) => ({ ...current, [key]: value }));
  };

  const submit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSaving(true);
    setMessage(null);
    setError(null);

    const endpoint = mode === "create" ? "/api/projects" : `/api/projects/${projectId}`;
    const method = mode === "create" ? "POST" : "PATCH";

    const body: Record<string, unknown> = {
      name: values.name,
      language_code: languageValue,
      country_code: countryValue,
      autocomplete_provider: canEditAutocompleteProvider ? values.autocomplete_provider : "GOOGLE_DIRECT",
      metrics_provider: values.metrics_provider,
      min_volume: values.min_volume,
      exclude_brands: values.exclude_brands,
      expand_alpha: values.expand_alpha,
      expand_numeric: values.expand_numeric,
      expand_patterns: values.expand_patterns,
      auto_classification: values.auto_classification,
      scoring_profile: values.scoring_profile,
    };

    if (mode === "create") {
      body.initial_subproject_name = values.initial_subproject_name;
      body.seeds = showSeeds ? values.seeds : "";
    }

    try {
      const response = await fetch(endpoint, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      const payload = await readJsonSafe<ProjectCreateResponse>(response);

      if (!response.ok) {
        throw new Error(buildApiErrorMessage(response, payload, "Impossibile salvare il progetto"));
      }

      if (mode === "create") {
        const createdProjectId = payload?.data?.project?.id ?? payload?.data?.id;
        if (createdProjectId) {
          router.push(`/projects/${createdProjectId}`);
          router.refresh();
          return;
        }
      }

      setMessage("Impostazioni salvate.");
      router.refresh();
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : "Errore imprevisto");
    } finally {
      setSaving(false);
    }
  };

  return (
    <form onSubmit={submit} className="space-y-6">
      <div className="grid gap-4 md:grid-cols-2">
        <div>
          <label className="label" htmlFor="name">
            Nome progetto
          </label>
          <input
            id="name"
            className="input"
            value={values.name}
            onChange={(event) => update("name", event.target.value)}
            required
          />
          <p className="mt-1 text-xs text-slate-500">Nome del contenitore principale (es. dominio o cliente).</p>
        </div>

        <div>
          <label className="label" htmlFor="min_volume">
            Volume minimo
          </label>
          <input
            id="min_volume"
            className="input"
            type="number"
            min={0}
            value={values.min_volume}
            onChange={(event) => update("min_volume", Number(event.target.value) || 0)}
          />
          <p className="mt-1 text-xs text-slate-500">Scarta keyword con volume inferiore a questo valore (0 = nessun filtro).</p>
        </div>

        <div>
          <label className="label" htmlFor="language_code">
            Lingua predefinita
          </label>
          <select
            id="language_code"
            className="select"
            value={languageValue}
            onChange={(event) => update("language_code", event.target.value)}
            required
          >
            {hasCustomLanguage && <option value={languageValue}>Codice attuale non standard ({languageValue})</option>}
            {LANGUAGE_OPTIONS.map((option) => (
              <option key={option.code} value={option.code}>
                {option.label} ({option.code})
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className="label" htmlFor="country_code">
            Paese predefinito
          </label>
          <select
            id="country_code"
            className="select"
            value={countryValue}
            onChange={(event) => update("country_code", event.target.value)}
            required
          >
            {hasCustomCountry && <option value={countryValue}>Codice attuale non standard ({countryValue})</option>}
            {countryOptions.map((option) => (
              <option key={option.code} value={option.code}>
                {option.label}
              </option>
            ))}
          </select>
        </div>

        {showInitialSubprojectName && mode === "create" && (
          <div>
            <label className="label" htmlFor="initial_subproject_name">
              Primo sottoprogetto
            </label>
            <input
              id="initial_subproject_name"
              className="input"
              value={values.initial_subproject_name}
              onChange={(event) => update("initial_subproject_name", event.target.value)}
              required
            />
            <p className="mt-1 text-xs text-slate-500">
              Nome del primo sottoprogetto creato insieme al progetto (default consigliato: Generale).
            </p>
          </div>
        )}

        {canEditAutocompleteProvider && (
          <div>
            <label className="label" htmlFor="autocomplete_provider">
              Provider autocomplete
            </label>
            <select
              id="autocomplete_provider"
              className="select"
              value={values.autocomplete_provider}
              onChange={(event) =>
                update("autocomplete_provider", event.target.value as ProjectFormValues["autocomplete_provider"])
              }
            >
              <option value="GOOGLE_DIRECT">GoogleDirectAutocompleteProvider</option>
              <option value="MOCK">MockAutocompleteProvider</option>
            </select>
          </div>
        )}

        <div>
          <label className="label" htmlFor="metrics_provider">
            Provider metriche
          </label>
          <select
            id="metrics_provider"
            className="select"
            value={values.metrics_provider}
            onChange={(event) => update("metrics_provider", event.target.value as ProjectFormValues["metrics_provider"])}
          >
            <option value="NONE">NoMetricsProvider</option>
            <option value="MOCK">MockMetricsProvider</option>
            <option value="GOOGLE_KEYWORD_PLANNER">GoogleKeywordPlannerMetricsProvider</option>
          </select>
        </div>

        <div>
          <label className="label" htmlFor="scoring_profile">
            Profilo scoring
          </label>
          <select
            id="scoring_profile"
            className="select"
            value={values.scoring_profile}
            onChange={(event) => update("scoring_profile", event.target.value)}
          >
            <option value="balanced">bilanciato</option>
            <option value="aggressive">aggressivo</option>
            <option value="conservative">conservativo</option>
          </select>
        </div>
      </div>

      {showSeeds && mode === "create" && (
        <div>
          <label className="label" htmlFor="seeds">
            Seed iniziali del primo sottoprogetto
          </label>
          <textarea
            id="seeds"
            className="input min-h-40"
            value={values.seeds}
            onChange={(event) => update("seeds", event.target.value)}
            placeholder="keyword uno\nkeyword due\nkeyword tre"
          />
          <p className="mt-1 text-xs text-slate-500">Le seed saranno assegnate al primo sottoprogetto creato.</p>
        </div>
      )}

      <div className="grid gap-3 md:grid-cols-2">
        <div className="rounded-xl border border-[var(--surface-border)] bg-[var(--surface-muted)] p-3">
          <label className="flex items-center gap-2 text-sm font-medium">
            <input type="checkbox" checked={values.exclude_brands} onChange={(event) => update("exclude_brands", event.target.checked)} />
            Escludi brand
          </label>
          <p className="mt-1 text-xs text-slate-500">Riduce o marca i termini brandizzati secondo la blacklist configurata.</p>
        </div>

        <div className="rounded-xl border border-[var(--surface-border)] bg-[var(--surface-muted)] p-3">
          <label className="flex items-center gap-2 text-sm font-medium">
            <input type="checkbox" checked={values.expand_alpha} onChange={(event) => update("expand_alpha", event.target.checked)} />
            Espandi alfabeto (a-z)
          </label>
          <p className="mt-1 text-xs text-slate-500">Aggiunge varianti con lettere (es. keyword a, keyword b, ...).</p>
        </div>

        <div className="rounded-xl border border-[var(--surface-border)] bg-[var(--surface-muted)] p-3">
          <label className="flex items-center gap-2 text-sm font-medium">
            <input type="checkbox" checked={values.expand_numeric} onChange={(event) => update("expand_numeric", event.target.checked)} />
            Espandi numerico (0-9)
          </label>
          <p className="mt-1 text-xs text-slate-500">Aggiunge varianti con numeri (es. keyword 1, keyword 2, ...).</p>
        </div>

        <div className="rounded-xl border border-[var(--surface-border)] bg-[var(--surface-muted)] p-3">
          <label className="flex items-center gap-2 text-sm font-medium">
            <input type="checkbox" checked={values.expand_patterns} onChange={(event) => update("expand_patterns", event.target.checked)} />
            Espandi pattern semantici
          </label>
          <p className="mt-1 text-xs text-slate-500">Usa pattern avanzati per ampliare la copertura delle query correlate.</p>
        </div>

        <div className="rounded-xl border border-[var(--surface-border)] bg-[var(--surface-muted)] p-3 md:col-span-2">
          <label className="flex items-center gap-2 text-sm font-medium">
            <input
              type="checkbox"
              checked={values.auto_classification}
              onChange={(event) => update("auto_classification", event.target.checked)}
            />
            Classificazione automatica
          </label>
          <p className="mt-1 text-xs text-slate-500">Assegna in automatico intento di ricerca e tipo keyword durante l'analisi.</p>
        </div>
      </div>

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:flex-wrap">
        <button className="btn-primary w-full sm:w-auto" disabled={saving} type="submit">
          {saving ? "Salvataggio..." : mode === "create" ? "Crea progetto" : "Salva impostazioni"}
        </button>
        {message && <p className="text-sm text-green-700">{message}</p>}
        {error && <p className="text-sm text-red-700">{error}</p>}
      </div>
    </form>
  );
}
