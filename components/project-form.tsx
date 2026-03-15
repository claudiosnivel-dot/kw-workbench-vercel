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
    initial_subproject_id?: string;
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
  const [submitIntent, setSubmitIntent] = useState<"save" | "save-and-run">("save");
  const [showAdvancedCreate, setShowAdvancedCreate] = useState(false);

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
  const seedCount = values.seeds
    .split(/[\n,;]+/)
    .map((item) => item.trim())
    .filter(Boolean).length;

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
        const initialSubprojectId = payload?.data?.initial_subproject_id;

        if (createdProjectId) {
          if (submitIntent === "save-and-run" && initialSubprojectId && seedCount > 0) {
            try {
              const runResponse = await fetch(`/api/projects/${createdProjectId}/run`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ subprojectId: initialSubprojectId }),
              });

              if (!runResponse.ok) {
                const runPayload = await readJsonSafe<ApiErrorPayload>(runResponse);
                const runErrorMessage = buildApiErrorMessage(
                  runResponse,
                  runPayload,
                  "Progetto creato, ma avvio estrazione automatico non riuscito"
                );
                window.alert(runErrorMessage);
              }
            } catch {
              window.alert("Progetto creato, ma avvio estrazione automatico non riuscito.");
            }
          }

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

  const showCreateFlow = mode === "create";

  return (
    <form onSubmit={submit} className="space-y-6">
      <section className="space-y-4 rounded-2xl border border-[var(--surface-border)] bg-[var(--surface-muted)] p-4">
        <h2 className="text-base font-semibold">{showCreateFlow ? "Step 1: Base progetto" : "Impostazioni principali"}</h2>

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
            <p className="mt-1 text-xs text-slate-500">Nome del contenitore principale (es. dominio, brand o cliente).</p>
          </div>

          {showInitialSubprojectName && mode === "create" && (
            <div>
              <label className="label" htmlFor="initial_subproject_name">
                Prima sezione
              </label>
              <input
                id="initial_subproject_name"
                className="input"
                value={values.initial_subproject_name}
                onChange={(event) => update("initial_subproject_name", event.target.value)}
                required
              />
              <p className="mt-1 text-xs text-slate-500">Nome della prima sezione operativa (consigliato: Generale).</p>
            </div>
          )}
        </div>

        {showSeeds && mode === "create" && (
          <div>
            <label className="label" htmlFor="seeds">
              Seed iniziali della prima sezione
            </label>
            <textarea
              id="seeds"
              className="input min-h-40"
              value={values.seeds}
              onChange={(event) => update("seeds", event.target.value)}
              placeholder="keyword uno\nkeyword due\nkeyword tre"
            />
            <p className="mt-1 text-xs text-slate-500">Una keyword per riga (supportate anche virgole e punto e virgola). Seed rilevate: {seedCount}.</p>
          </div>
        )}
      </section>

      {showCreateFlow ? (
        <section className="space-y-4 rounded-2xl border border-[var(--surface-border)] bg-[var(--surface-muted)] p-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 className="text-base font-semibold">Step 2: Avanzate (opzionale)</h2>
            <button
              type="button"
              className="btn-secondary"
              onClick={() => setShowAdvancedCreate((current) => !current)}
            >
              {showAdvancedCreate ? "Nascondi avanzate" : "Mostra avanzate"}
            </button>
          </div>

          {showAdvancedCreate && (
            <AdvancedProjectFields
              values={values}
              update={update}
              languageValue={languageValue}
              countryValue={countryValue}
              hasCustomLanguage={hasCustomLanguage}
              hasCustomCountry={hasCustomCountry}
              languageOptions={LANGUAGE_OPTIONS}
              countryOptions={countryOptions}
              canEditAutocompleteProvider={canEditAutocompleteProvider}
            />
          )}
        </section>
      ) : (
        <section className="space-y-4 rounded-2xl border border-[var(--surface-border)] bg-[var(--surface-muted)] p-4">
          <h2 className="text-base font-semibold">Impostazioni avanzate</h2>
          <AdvancedProjectFields
            values={values}
            update={update}
            languageValue={languageValue}
            countryValue={countryValue}
            hasCustomLanguage={hasCustomLanguage}
            hasCustomCountry={hasCustomCountry}
            languageOptions={LANGUAGE_OPTIONS}
            countryOptions={countryOptions}
            canEditAutocompleteProvider={canEditAutocompleteProvider}
          />
        </section>
      )}

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:flex-wrap">
        <button
          className="btn-primary w-full sm:w-auto"
          disabled={saving}
          type="submit"
          onClick={() => setSubmitIntent("save")}
        >
          {saving ? "Salvataggio..." : mode === "create" ? "Crea e apri progetto" : "Salva impostazioni"}
        </button>

        {mode === "create" && (
          <button
            className="btn-secondary w-full sm:w-auto"
            disabled={saving || seedCount === 0}
            type="submit"
            onClick={() => setSubmitIntent("save-and-run")}
            title={seedCount === 0 ? "Inserisci almeno una seed per avviare subito" : ""}
          >
            {saving && submitIntent === "save-and-run" ? "Avvio..." : "Crea e avvia prima estrazione"}
          </button>
        )}

        {message && <p className="text-sm text-green-700">{message}</p>}
        {error && <p className="text-sm text-red-700">{error}</p>}
      </div>
    </form>
  );
}

type AdvancedProjectFieldsProps = {
  values: ProjectFormValues;
  update: <K extends keyof ProjectFormValues>(key: K, value: ProjectFormValues[K]) => void;
  languageValue: string;
  countryValue: string;
  hasCustomLanguage: boolean;
  hasCustomCountry: boolean;
  languageOptions: ReadonlyArray<{ code: string; label: string }>;
  countryOptions: ReadonlyArray<{ code: string; label: string }>;
  canEditAutocompleteProvider: boolean;
};

function AdvancedProjectFields({
  values,
  update,
  languageValue,
  countryValue,
  hasCustomLanguage,
  hasCustomCountry,
  languageOptions,
  countryOptions,
  canEditAutocompleteProvider,
}: AdvancedProjectFieldsProps) {
  return (
    <>
      <div className="grid gap-4 md:grid-cols-2">
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
            {languageOptions.map((option) => (
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

        {canEditAutocompleteProvider && (
          <div>
            <label className="label" htmlFor="autocomplete_provider">
              Provider autocomplete
            </label>
            <select
              id="autocomplete_provider"
              className="select"
              value={values.autocomplete_provider}
              onChange={(event) => update("autocomplete_provider", event.target.value as ProjectFormValues["autocomplete_provider"])}
            >
              <option value="GOOGLE_DIRECT">Google (predefinito)</option>
              <option value="MOCK">Mock</option>
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
            <option value="NONE">Nessuna metrica</option>
            <option value="MOCK">Mock</option>
            <option value="GOOGLE_KEYWORD_PLANNER">Google Keyword Planner</option>
          </select>
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
          <p className="mt-1 text-xs text-slate-500">Filtra le keyword con volume inferiore a questo valore (0 = nessun filtro).</p>
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

      <div className="grid gap-3 md:grid-cols-2">
        <div className="rounded-xl border border-[var(--surface-border)] bg-[var(--surface-background)] p-3">
          <label className="flex items-center gap-2 text-sm font-medium">
            <input type="checkbox" checked={values.exclude_brands} onChange={(event) => update("exclude_brands", event.target.checked)} />
            Escludi brand
          </label>
          <p className="mt-1 text-xs text-slate-500">Riduce o marca i termini brandizzati secondo blacklist.</p>
        </div>

        <div className="rounded-xl border border-[var(--surface-border)] bg-[var(--surface-background)] p-3">
          <label className="flex items-center gap-2 text-sm font-medium">
            <input type="checkbox" checked={values.expand_alpha} onChange={(event) => update("expand_alpha", event.target.checked)} />
            Espansione alfabeto (a-z)
          </label>
          <p className="mt-1 text-xs text-slate-500">Aggiunge varianti con lettere (es. keyword a, keyword b).</p>
        </div>

        <div className="rounded-xl border border-[var(--surface-border)] bg-[var(--surface-background)] p-3">
          <label className="flex items-center gap-2 text-sm font-medium">
            <input type="checkbox" checked={values.expand_numeric} onChange={(event) => update("expand_numeric", event.target.checked)} />
            Espansione numerica (0-9)
          </label>
          <p className="mt-1 text-xs text-slate-500">Aggiunge varianti con numeri (es. keyword 1, keyword 2).</p>
        </div>

        <div className="rounded-xl border border-[var(--surface-border)] bg-[var(--surface-background)] p-3">
          <label className="flex items-center gap-2 text-sm font-medium">
            <input type="checkbox" checked={values.expand_patterns} onChange={(event) => update("expand_patterns", event.target.checked)} />
            Espansione pattern semantici
          </label>
          <p className="mt-1 text-xs text-slate-500">Amplia la copertura delle query correlate.</p>
        </div>

        <div className="rounded-xl border border-[var(--surface-border)] bg-[var(--surface-background)] p-3 md:col-span-2">
          <label className="flex items-center gap-2 text-sm font-medium">
            <input
              type="checkbox"
              checked={values.auto_classification}
              onChange={(event) => update("auto_classification", event.target.checked)}
            />
            Classificazione automatica
          </label>
          <p className="mt-1 text-xs text-slate-500">Assegna intento e tipo keyword durante l'analisi.</p>
        </div>
      </div>
    </>
  );
}

