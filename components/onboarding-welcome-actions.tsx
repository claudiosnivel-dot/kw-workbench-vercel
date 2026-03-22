"use client";

import { useState } from "react";

type OnboardingWelcomeActionsProps = {
  hasExistingData: boolean;
};

export function OnboardingWelcomeActions({ hasExistingData }: OnboardingWelcomeActionsProps) {
  const [loadingMode, setLoadingMode] = useState<"resume" | "restart" | null>(null);
  const [error, setError] = useState<string | null>(null);

  const choose = async (mode: "resume" | "restart") => {
    setLoadingMode(mode);
    setError(null);

    try {
      const response = await fetch("/api/onboarding/choice", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mode }),
      });

      const payload = (await response.json().catch(() => null)) as
        | { meta?: { nextPath?: string }; error?: string }
        | null;

      if (!response.ok) {
        throw new Error(payload?.error || "Scelta percorso non riuscita.");
      }

      const nextPath = payload?.meta?.nextPath || "/onboarding/project-create";
      window.location.assign(nextPath);
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : "Errore imprevisto");
      setLoadingMode(null);
    }
  };

  return (
    <section className="card space-y-5">
      <div className="space-y-2">
        <h2 className="text-xl font-semibold">Seleziona come partire</h2>
        <p className="text-sm text-slate-600">
          {hasExistingData
            ? "Hai gia dati presenti: puoi riprendere dal primo step mancante o ricominciare il percorso guidato."
            : "Iniziamo da zero: il wizard ti accompagna passo dopo passo fino al primo export."}
        </p>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <button
          type="button"
          className="btn-primary w-full"
          onClick={() => choose("resume")}
          disabled={Boolean(loadingMode)}
        >
          {loadingMode === "resume" ? "Apertura..." : hasExistingData ? "Riprendi da dove sei" : "Inizia percorso guidato"}
        </button>
        <button
          type="button"
          className="btn-secondary w-full"
          onClick={() => choose("restart")}
          disabled={Boolean(loadingMode)}
        >
          {loadingMode === "restart" ? "Preparazione..." : "Ricomincia da zero"}
        </button>
      </div>

      {error && <p className="text-sm text-red-700">{error}</p>}
    </section>
  );
}
