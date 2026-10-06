"use client";

import { useTranslations } from "next-intl";
import { FormEvent, useState } from "react";
import { CardIntro } from "@/components/card-intro";
import { OnboardingBackLink } from "@/components/onboarding-back-link";
import { ApiErrorPayload, readApiResponse } from "@/lib/client/http";
import { useLocaleOptions } from "@/lib/client/use-locale-options";
import { isSupportedCountryCode, isSupportedLanguageCode } from "@/lib/constants/locale-options";
import { type OnboardingProjectSnapshot } from "@/lib/onboarding/types";

type ProjectTargetingFormProps = {
  project: OnboardingProjectSnapshot;
};

export function OnboardingProjectTargetingForm({ project }: ProjectTargetingFormProps) {
  const t = useTranslations("onboarding");
  const tFields = useTranslations("projects.fields");
  const tErrors = useTranslations("errors");
  const tCommon = useTranslations("common");
  const [languageCode, setLanguageCode] = useState(project.language_code);
  const [countryCode, setCountryCode] = useState(project.country_code);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const { languageOptions, countryOptions } = useLocaleOptions();

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

      await readApiResponse<ApiErrorPayload>(response, tErrors);

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
        throw new Error(t("targeting.advanceFailed"));
      }

      window.location.assign("/onboarding/section-create");
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : tCommon("unexpectedError"));
      setSaving(false);
    }
  };

  return (
    <section className="card space-y-4">
      <CardIntro
        variant="step"
        title={t("targeting.title")}
        intro={
          <>
            {t("activeProject")} <span className="font-medium">{project.name}</span>. {t("targeting.hint")}
          </>
        }
      />

      <form className="space-y-4" onSubmit={submit}>
        <div className="grid gap-4 md:grid-cols-2">
          <div>
            <label className="label" htmlFor="onboarding-language">
              {tFields("language")}
            </label>
            <select
              id="onboarding-language"
              className="select"
              value={normalizedLanguage}
              onChange={(event) => setLanguageCode(event.target.value)}
              required
            >
              {hasCustomLanguage && <option value={normalizedLanguage}>{tFields("customCode", { code: normalizedLanguage })}</option>}
              {languageOptions.map((option) => (
                <option key={option.code} value={option.code}>
                  {option.label}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="label" htmlFor="onboarding-country">
              {tFields("country")}
            </label>
            <select
              id="onboarding-country"
              className="select"
              value={normalizedCountry}
              onChange={(event) => setCountryCode(event.target.value)}
              required
            >
              {hasCustomCountry && <option value={normalizedCountry}>{tFields("customCode", { code: normalizedCountry })}</option>}
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
            {saving ? tCommon("saving") : t("targeting.submit")}
          </button>
          <OnboardingBackLink href="/onboarding/project-create" />
        </div>

        {error && <p className="text-sm text-red-700">{error}</p>}
      </form>
    </section>
  );
}
