"use client";

import { useTranslations } from "next-intl";
import { openOnboardingPath } from "@/lib/client/onboarding";
import { useLeavingAction } from "@/lib/client/use-leaving-action";

type ResumeOnboardingButtonProps = {
  className?: string;
};

export function ResumeOnboardingButton({ className = "" }: ResumeOnboardingButtonProps) {
  const t = useTranslations("onboarding.resume");
  const { pending, error, run } = useLeavingAction();
  const resume = () => run((tErrors) => openOnboardingPath("/api/onboarding/resume", null, "/onboarding", tErrors));

  return (
    <div className="space-y-2">
      <button type="button" className={`btn-primary ${className}`.trim()} onClick={resume} disabled={pending !== null}>
        {pending ? t("opening") : t("submit")}
      </button>
      {error && <p className="text-sm text-red-700">{error}</p>}
    </div>
  );
}
