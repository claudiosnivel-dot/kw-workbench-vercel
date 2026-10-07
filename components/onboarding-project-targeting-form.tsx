"use client";

import { useTranslations } from "next-intl";
import { FormEvent, useState } from "react";
import { LocaleCodeOptions } from "@/components/locale-code-options";
import { OnboardingBackLink } from "@/components/onboarding-back-link";
import { OnboardingStepCard } from "@/components/onboarding-step-card";
import { useStepSave } from "@/lib/client/onboarding";
import { type OnboardingProjectSnapshot } from "@/lib/onboarding/types";

type ProjectTargetingFormProps = {
  project: OnboardingProjectSnapshot;
};

export function OnboardingProjectTargetingForm({ project }: ProjectTargetingFormProps) {
  const t = useTranslations("onboarding");
  const tFields = useTranslations("projects.fields");
  const tCommon = useTranslations("common");
  const [languageCode, setLanguageCode] = useState(project.language_code);
  const [countryCode, setCountryCode] = useState(project.country_code);
  const { saving, error, saveStep } = useStepSave();

  const normalizedLanguage = languageCode.trim().toLowerCase() || "en";
  const normalizedCountry = countryCode.trim().toUpperCase() || "US";

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const body = {
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
    };
    const state = { currentStep: "SECTION_CREATE", status: "IN_PROGRESS", activeProjectId: project.id };
    const url = `/api/projects/${project.id}`;
    saveStep({ url, body, state, nextPath: "/onboarding/section-create", advanceFailed: t("targeting.advanceFailed") });
  };

  return (
    <OnboardingStepCard title={t("targeting.title")} contextLabel={t("activeProject")} contextName={project.name} hint={t("targeting.hint")}>

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
              <LocaleCodeOptions kind="language" current={normalizedLanguage} />
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
              <LocaleCodeOptions kind="country" current={normalizedCountry} />
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
    </OnboardingStepCard>
  );
}
