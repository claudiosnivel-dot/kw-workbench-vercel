"use client";

import Link from "next/link";
import { FormEvent, useMemo, useState } from "react";
import { ApiErrorPayload, buildApiErrorMessage, readJsonSafe } from "@/lib/client/http";
import {
  COUNTRY_CODES,
  LANGUAGE_OPTIONS,
  isSupportedCountryCode,
  isSupportedLanguageCode,
} from "@/lib/constants/locale-options";
import { type OnboardingProjectSnapshot } from "@/lib/onboarding/types";

type ProjectTargetingFormProps = {
  project: OnboardingProjectSnapshot;
};

export function OnboardingProjectTargetingForm({ project }: ProjectTargetingFormProps) {
  const [languageCode, setLanguageCode] = useState(project.language_code);
  const [countryCode, setCountryCode] = useState(project.country_code);
  const [saving, setSaving] = useState(false);
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
        const label = regionNames?.of(code) ?? code;
        return { code, label: `${label} (${code})` };
      }),
    [regionNames]
  );

  const normalizedLanguage = languageCode.trim().toLowerCase() || "en";
  const normalizedCountry = countryCode.trim().toUpperCase() || "US";

  const hasCustomLanguage = !isSupportedLanguageCode(normalizedLanguage);
  const hasCustomCountry = !isSupportedCountryCode(normalizedCountry);

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSaving(true);
    setError(null);

    try {
      const response = await fetch(`/api/projects/${project.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: project.name,
          language_code: normalizedLanguage,
          country_code: normalizedCountry,
          autocomplete_provider: project.autocomplete_provider,
          metrics_provider: project.metrics_provider,
          min_volume: project.min_volume,
          exclude_brands: project.exclude_brands,
          expand_alpha: project.expand_alpha,
          expand_numeric: project.expand_numeric,
          expand_patterns: project.expand_patterns,
          auto_classification: project.auto_classification,
          scoring_profile: project.scoring_profile,
        }),
      });

      const payload = await readJsonSafe<ApiErrorPayload>(response);
      if (!response.ok) {
        throw new Error(buildApiErrorMessage(response, payload, "Aggiornamento targeting non riuscito"));
      }

      const onboardingResponse = await fetch("/api/onboarding/state", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          currentStep: "SECTION_CREATE",
          status: "IN_PROGRESS",
          activeProjectId: project.id,
        }),
      });

      if (!onboardingResponse.ok) {
        throw new Error("Targeting salvato, ma avanzamento onboarding non riuscito.");
      }

      window.location.assign("/onboarding/section-create");
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : "Errore imprevisto");
      setSaving(false);
    }
  };

  return (
    <section className="card space-y-4">
      <h2 className="text-xl font-semibold">Step 3: Targeting progetto</h2>
      <p className="text-sm text-slate-600">
        Progetto attivo: <span className="font-medium">{project.name}</span>. Imposta lingua e paese principali.
      </p>

      <form className="space-y-4" onSubmit={submit}>
        <div className="grid gap-4 md:grid-cols-2">
          <div>
            <label className="label" htmlFor="onboarding-language">
              Lingua predefinita
            </label>
            <select
              id="onboarding-language"
              className="select"
              value={normalizedLanguage}
              onChange={(event) => setLanguageCode(event.target.value)}
              required
            >
              {hasCustomLanguage && <option value={normalizedLanguage}>Codice attuale non standard ({normalizedLanguage})</option>}
              {LANGUAGE_OPTIONS.map((option) => (
                <option key={option.code} value={option.code}>
                  {option.label} ({option.code})
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="label" htmlFor="onboarding-country">
              Paese predefinito
            </label>
            <select
              id="onboarding-country"
              className="select"
              value={normalizedCountry}
              onChange={(event) => setCountryCode(event.target.value)}
              required
            >
              {hasCustomCountry && <option value={normalizedCountry}>Codice attuale non standard ({normalizedCountry})</option>}
              {countryOptions.map((option) => (
                <option key={option.code} value={option.code}>
                  {option.label}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap">
          <button className="btn-primary w-full sm:w-auto" type="submit" disabled={saving}>
            {saving ? "Salvataggio..." : "Salva targeting e continua"}
          </button>
          <Link className="btn-secondary w-full text-center sm:w-auto" href="/onboarding/project-create">
            Torna allo step precedente
          </Link>
        </div>

        {error && <p className="text-sm text-red-700">{error}</p>}
      </form>
    </section>
  );
}
