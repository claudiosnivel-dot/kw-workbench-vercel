"use client";

import { useTranslations } from "next-intl";
import { usePathname } from "next/navigation";
import { useMemo } from "react";
import { pauseOnboardingAndOpenDashboard } from "@/lib/client/onboarding";
import { useLeavingAction } from "@/lib/client/use-leaving-action";
import {
  ONBOARDING_STEP_META,
  ONBOARDING_TOTAL_STEPS,
  pathToStep,
} from "@/lib/onboarding/constants";

// Larghezze della barra come classi statiche (step 0…7 su 7): con la CSP di T-505 un attributo
// style inline verrebbe bloccato da style-src, che ammette solo i fogli dell'app e i nonce.
const PROGRESS_WIDTH_CLASSES = ["w-0", "w-1/7", "w-2/7", "w-3/7", "w-4/7", "w-5/7", "w-6/7", "w-full"];

export function OnboardingProgressHeader() {
  const t = useTranslations("onboarding");
  const tCommon = useTranslations("common");
  const pathname = usePathname();
  const { pending, error, run } = useLeavingAction();

  const currentStep = useMemo(() => pathToStep(pathname) ?? "WELCOME", [pathname]);
  const meta = ONBOARDING_STEP_META[currentStep];
  const progressPercent = Math.round((meta.index / ONBOARDING_TOTAL_STEPS) * 100);

  return (
    <section className="card space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="space-y-1">
          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-emerald-700">{t("eyebrow")}</p>
          <h1 className="text-2xl font-semibold">{t(`steps.${currentStep}.title`)}</h1>
          <p className="text-sm text-slate-600">{t(`steps.${currentStep}.description`)}</p>
        </div>
        <button
          type="button"
          className="btn-secondary w-full sm:w-auto"
          onClick={() => run(pauseOnboardingAndOpenDashboard)}
          disabled={pending !== null}
        >
          {pending ? tCommon("saving") : t("skip")}
        </button>
      </div>

      <div className="space-y-2">
        <div className="flex items-center justify-between text-xs text-slate-500">
          <span>
            {t("stepOf", {
              index: meta.index,
              total: ONBOARDING_TOTAL_STEPS,
              label: t(`steps.${currentStep}.shortLabel`),
            })}
          </span>
          <span>{progressPercent}%</span>
        </div>
        <div className="h-2 w-full overflow-hidden rounded-full border border-[var(--surface-border)] bg-[var(--surface-muted)]">
          <div
            className={`h-full rounded-full bg-[var(--brand-600)] transition-all ${PROGRESS_WIDTH_CLASSES[meta.index] ?? "w-full"}`}
          />
        </div>
      </div>

      {error && <p className="text-sm text-red-700">{error}</p>}
    </section>
  );
}
