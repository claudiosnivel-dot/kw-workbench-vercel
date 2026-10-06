"use client";

import { useTranslations } from "next-intl";
import { CardIntro } from "@/components/card-intro";
import { openOnboardingPath } from "@/lib/client/onboarding";
import { useLeavingAction } from "@/lib/client/use-leaving-action";

type OnboardingWelcomeActionsProps = {
  hasExistingData: boolean;
};

export function OnboardingWelcomeActions({ hasExistingData }: OnboardingWelcomeActionsProps) {
  const t = useTranslations("onboarding.welcome");
  const { pending: loadingMode, error, run } = useLeavingAction<"resume" | "restart">();

  const choose = (mode: "resume" | "restart") =>
    run((tErrors) => openOnboardingPath("/api/onboarding/choice", { mode }, "/onboarding/project-create", tErrors), mode);

  return (
    <section className="card space-y-5">
      <CardIntro variant="stepGroup" title={t("title")} intro={hasExistingData ? t("existing") : t("fresh")} />

      <div className="grid gap-3 sm:grid-cols-2">
        <button
          type="button"
          className="btn-primary w-full"
          onClick={() => choose("resume")}
          disabled={Boolean(loadingMode)}
        >
          {loadingMode === "resume" ? t("opening") : hasExistingData ? t("resume") : t("start")}
        </button>
        <button
          type="button"
          className="btn-secondary w-full"
          onClick={() => choose("restart")}
          disabled={Boolean(loadingMode)}
        >
          {loadingMode === "restart" ? t("preparing") : t("restart")}
        </button>
      </div>

      {error && <p className="text-sm text-red-700">{error}</p>}
    </section>
  );
}
