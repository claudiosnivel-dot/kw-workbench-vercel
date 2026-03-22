"use client";

import { usePathname } from "next/navigation";
import { useMemo, useState } from "react";
import {
  ONBOARDING_STEP_META,
  ONBOARDING_TOTAL_STEPS,
  pathToStep,
} from "@/lib/onboarding/constants";

export function OnboardingProgressHeader() {
  const pathname = usePathname();
  const [skipping, setSkipping] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const currentStep = useMemo(() => pathToStep(pathname) ?? "WELCOME", [pathname]);
  const meta = ONBOARDING_STEP_META[currentStep];
  const progressPercent = Math.round((meta.index / ONBOARDING_TOTAL_STEPS) * 100);

  const skip = async () => {
    setSkipping(true);
    setError(null);

    try {
      const response = await fetch("/api/onboarding/skip", {
        method: "POST",
      });

      if (!response.ok) {
        throw new Error("Impossibile mettere in pausa il percorso guidato.");
      }

      window.location.assign("/");
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : "Errore imprevisto");
      setSkipping(false);
    }
  };

  return (
    <section className="card space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="space-y-1">
          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-emerald-700">Percorso guidato</p>
          <h1 className="text-2xl font-semibold">{meta.title}</h1>
          <p className="text-sm text-slate-600">{meta.description}</p>
        </div>
        <button
          type="button"
          className="btn-secondary w-full sm:w-auto"
          onClick={skip}
          disabled={skipping}
        >
          {skipping ? "Salvataggio..." : "Salta per ora"}
        </button>
      </div>

      <div className="space-y-2">
        <div className="flex items-center justify-between text-xs text-slate-500">
          <span>
            Step {meta.index} di {ONBOARDING_TOTAL_STEPS} ({meta.shortLabel})
          </span>
          <span>{progressPercent}%</span>
        </div>
        <div className="h-2 w-full overflow-hidden rounded-full border border-[var(--surface-border)] bg-[var(--surface-muted)]">
          <div
            className="h-full rounded-full bg-[var(--brand-600)] transition-all"
            style={{ width: `${progressPercent}%` }}
          />
        </div>
      </div>

      {error && <p className="text-sm text-red-700">{error}</p>}
    </section>
  );
}
