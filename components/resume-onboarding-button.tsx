"use client";

import { useState } from "react";

type ResumeOnboardingButtonProps = {
  className?: string;
};

export function ResumeOnboardingButton({ className = "" }: ResumeOnboardingButtonProps) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const resume = async () => {
    setLoading(true);
    setError(null);

    try {
      const response = await fetch("/api/onboarding/resume", { method: "POST" });
      const payload = (await response.json().catch(() => null)) as
        | { meta?: { nextPath?: string }; error?: string }
        | null;

      if (!response.ok) {
        throw new Error(payload?.error || "Impossibile riprendere il percorso guidato.");
      }

      const nextPath = payload?.meta?.nextPath || "/onboarding";
      window.location.assign(nextPath);
    } catch (resumeError) {
      setError(resumeError instanceof Error ? resumeError.message : "Errore imprevisto");
      setLoading(false);
    }
  };

  return (
    <div className="space-y-2">
      <button type="button" className={`btn-primary ${className}`.trim()} onClick={resume} disabled={loading}>
        {loading ? "Apertura percorso..." : "Riprendi percorso guidato"}
      </button>
      {error && <p className="text-sm text-red-700">{error}</p>}
    </div>
  );
}
