"use client";

import { useTranslations } from "next-intl";
import { FormEvent, useState } from "react";
import { CardIntro } from "@/components/card-intro";
import { OnboardingBackLink } from "@/components/onboarding-back-link";
import { ApiErrorPayload, readApiResponse } from "@/lib/client/http";
import {
  type OnboardingProjectSnapshot,
  type OnboardingSubprojectSnapshot,
} from "@/lib/onboarding/types";

type OnboardingSeedsFormProps = {
  project: OnboardingProjectSnapshot;
  subproject: OnboardingSubprojectSnapshot;
  initialSeeds: string;
};

function boolOverrideToPayload(value: boolean | null): "inherit" | "true" | "false" {
  if (value === null) {
    return "inherit";
  }

  return value ? "true" : "false";
}

export function OnboardingSeedsForm({ project, subproject, initialSeeds }: OnboardingSeedsFormProps) {
  const t = useTranslations("onboarding");
  const tErrors = useTranslations("errors");
  const tCommon = useTranslations("common");
  const tProject = useTranslations("projects.form");
  const [seeds, setSeeds] = useState(initialSeeds);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const seedCount = seeds
    .split(/[\n,;]+/)
    .map((item) => item.trim())
    .filter(Boolean).length;

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSaving(true);
    setError(null);

    try {
      const response = await fetch(`/api/projects/${project.id}/subprojects/${subproject.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: subproject.name,
          description: subproject.description ?? "",
          seeds,
          language_code_override: subproject.language_code_override,
          country_code_override: subproject.country_code_override,
          autocomplete_provider_override: subproject.autocomplete_provider_override ?? "",
          metrics_provider_override: subproject.metrics_provider_override ?? "",
          min_volume_override: subproject.min_volume_override ?? "",
          exclude_brands_override: boolOverrideToPayload(subproject.exclude_brands_override),
          expand_alpha_override: boolOverrideToPayload(subproject.expand_alpha_override),
          expand_numeric_override: boolOverrideToPayload(subproject.expand_numeric_override),
          expand_patterns_override: boolOverrideToPayload(subproject.expand_patterns_override),
          auto_classification_override: boolOverrideToPayload(subproject.auto_classification_override),
          scoring_profile_override: subproject.scoring_profile_override ?? "",
        }),
      });

      await readApiResponse<ApiErrorPayload>(response, tErrors);

      const onboardingResponse = await fetch("/api/onboarding/state", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          status: "IN_PROGRESS",
          currentStep: "RUN",
          activeProjectId: project.id,
          activeSubprojectId: subproject.id,
        }),
      });

      if (!onboardingResponse.ok) {
        throw new Error(t("seeds.advanceFailed"));
      }

      window.location.assign("/onboarding/run");
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : tCommon("unexpectedError"));
      setSaving(false);
    }
  };

  return (
    <section className="card space-y-4">
      <CardIntro
        variant="step"
        title={t("seeds.title")}
        intro={
          <>
            {t("activeSection")} <span className="font-medium">{subproject.name}</span>.
          </>
        }
      />

      <form className="space-y-4" onSubmit={submit}>
        <div>
          <label className="label" htmlFor="onboarding-seeds">
            {t("seeds.label")}
          </label>
          <textarea
            id="onboarding-seeds"
            className="input min-h-48"
            value={seeds}
            onChange={(event) => setSeeds(event.target.value)}
            placeholder={tProject("seedsPlaceholder")}
          />
          <p className="mt-1 text-xs text-slate-500">{t("seeds.hint", { count: seedCount })}</p>
        </div>

        {seedCount === 0 && (
          <p className="text-sm text-slate-600">{t("seeds.empty")}</p>
        )}

        <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap">
          <button className="btn-primary w-full sm:w-auto" type="submit" disabled={saving || seedCount === 0}>
            {saving ? tCommon("saving") : t("seeds.submit")}
          </button>
          <OnboardingBackLink href="/onboarding/section-create" />
        </div>

        {error && <p className="text-sm text-red-700">{error}</p>}
      </form>
    </section>
  );
}
