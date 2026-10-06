"use client";

import { useTranslations } from "next-intl";
import { useState } from "react";
import { CardIntro } from "@/components/card-intro";
import { useOnboardingCreation } from "@/lib/client/onboarding";

const IDEMPOTENCY_STORAGE_KEY = "onboarding-idempotency:project-create";

export function OnboardingProjectCreateForm() {
  const t = useTranslations("onboarding.projectCreate");
  const tProject = useTranslations("projects.form");
  const [name, setName] = useState("");
  const { saving, error, create } = useOnboardingCreation({
    url: "/api/onboarding/project",
    storageKey: IDEMPOTENCY_STORAGE_KEY,
    fallbackPath: "/onboarding/project-targeting",
    nameRequired: t("nameRequired"),
  });

  return (
    <section className="card space-y-4">
      <CardIntro variant="step" title={t("title")} intro={t("intro")} />
      <form
        className="space-y-4"
        onSubmit={(event) => {
          event.preventDefault();
          create(name);
        }}
      >
        <div>
          <label className="label" htmlFor="onboarding-project-name">
            {tProject("name")}
          </label>
          <input
            id="onboarding-project-name"
            className="input"
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder={t("namePlaceholder")}
            required
          />
        </div>

        <button className="btn-primary w-full sm:w-auto" type="submit" disabled={saving}>
          {saving ? t("creating") : t("submit")}
        </button>

        {error && <p className="text-sm text-red-700">{error}</p>}
      </form>
    </section>
  );
}
