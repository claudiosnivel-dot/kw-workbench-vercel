"use client";

import Link from "next/link";
import { useState } from "react";
import { JobProgress } from "@/components/job-progress";
import { readStartedJobId } from "@/lib/client/run-extraction";

type OnboardingRunStepProps = {
  projectId: string;
  subprojectId: string;
  projectName: string;
  subprojectName: string;
  /** Pagina dei risultati della sezione attiva. */
  resultsHref: string;
  /** Job pending o running della sezione: al ricaricamento l'avanzamento riprende da qui. */
  activeJobId?: string | null;
};

export function OnboardingRunStep({
  projectId,
  subprojectId,
  projectName,
  subprojectName,
  resultsHref,
  activeJobId = null,
}: OnboardingRunStepProps) {
  const [starting, setStarting] = useState(false);
  const [jobId, setJobId] = useState<string | null>(activeJobId);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const runExtraction = async () => {
    setStarting(true);
    setError(null);
    setSuccess(null);

    try {
      const response = await fetch(`/api/projects/${projectId}/run`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ subprojectId }),
      });

      setJobId(await readStartedJobId(response));
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : "Errore imprevisto");
    } finally {
      setStarting(false);
    }
  };

  // Solo a job completed l'onboarding avanza: con failed o canceled JobProgress mostra l'esito e si resta qui.
  const advanceOnboarding = async () => {
    try {
      const onboardingResponse = await fetch("/api/onboarding/state", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          status: "IN_PROGRESS",
          currentStep: "REVIEW_EXPORT",
          activeProjectId: projectId,
          activeSubprojectId: subprojectId,
        }),
      });

      if (!onboardingResponse.ok) {
        throw new Error("Estrazione completata, ma avanzamento onboarding non riuscito.");
      }

      setSuccess("Estrazione completata. Ora passa alla revisione/export.");
      window.setTimeout(() => {
        window.location.assign("/onboarding/review-export");
      }, 450);
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : "Errore imprevisto");
    }
  };

  return (
    <section className="card space-y-4">
      <h2 className="text-xl font-semibold">Step 6: Avvia estrazione</h2>
      <p className="text-sm text-slate-600">
        Progetto <span className="font-medium">{projectName}</span> - Sezione{" "}
        <span className="font-medium">{subprojectName}</span>.
      </p>

      <div className="rounded-xl border border-[var(--surface-border)] bg-[var(--surface-muted)] p-4 text-sm text-slate-600">
        Lanceremo subito un job reale sulla sezione attiva con le seed inserite al passo precedente.
      </div>

      {jobId && <JobProgress key={jobId} jobId={jobId} resultsHref={resultsHref} onCompleted={advanceOnboarding} />}

      <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap">
        <button className="btn-primary w-full sm:w-auto" type="button" onClick={runExtraction} disabled={starting}>
          {starting ? "Estrazione in corso..." : "Avvia prima estrazione"}
        </button>
        <Link className="btn-secondary w-full text-center sm:w-auto" href="/onboarding/seeds">
          Torna allo step precedente
        </Link>
      </div>

      {error && <p className="text-sm text-red-700">{error}</p>}
      {success && <p className="text-sm text-green-700">{success}</p>}
    </section>
  );
}
