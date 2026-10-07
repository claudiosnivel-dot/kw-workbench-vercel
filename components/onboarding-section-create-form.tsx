"use client";

import { useTranslations } from "next-intl";
import { useState } from "react";
import { OnboardingBackLink } from "@/components/onboarding-back-link";
import { OnboardingStepCard } from "@/components/onboarding-step-card";
import { useOnboardingCreation } from "@/lib/client/onboarding";

type OnboardingSectionCreateFormProps = {
  projectId: string;
  projectName: string;
};

export function OnboardingSectionCreateForm({ projectId, projectName }: OnboardingSectionCreateFormProps) {
  const t = useTranslations("onboarding");
  const tSections = useTranslations("sections.form");
  const tProject = useTranslations("projects.form");
  const [name, setName] = useState(() => tProject("defaultSectionName"));
  const { saving, error, create } = useOnboardingCreation({
    url: "/api/onboarding/section",
    storageKey: `onboarding-idempotency:section-create:${projectId}`,
    fallbackPath: "/onboarding/seeds",
    nameRequired: t("sectionCreate.nameRequired"),
  });

  return (
    <OnboardingStepCard title={t("sectionCreate.title")} contextLabel={t("activeProject")} contextName={projectName}>

      <form
        className="space-y-4"
        onSubmit={(event) => {
          event.preventDefault();
          create(name, { projectId });
        }}
      >
        <div>
          <label className="label" htmlFor="onboarding-section-name">
            {tSections("name")}
          </label>
          <input
            id="onboarding-section-name"
            className="input"
            value={name}
            onChange={(event) => setName(event.target.value)}
            required
          />
          <p className="mt-1 text-xs text-slate-500">{t("sectionCreate.hint")}</p>
        </div>

        <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap">
          <button className="btn-primary w-full sm:w-auto" type="submit" disabled={saving}>
            {saving ? t("projectCreate.creating") : t("sectionCreate.submit")}
          </button>
          <OnboardingBackLink href="/onboarding/project-targeting" />
        </div>

        {error && <p className="text-sm text-red-700">{error}</p>}
      </form>
    </OnboardingStepCard>
  );
}
