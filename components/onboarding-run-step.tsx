"use client";

import { useTranslations } from "next-intl";
import { useState } from "react";
import { CardIntro } from "@/components/card-intro";
import { JobProgress } from "@/components/job-progress";
import { OnboardingBackLink } from "@/components/onboarding-back-link";
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
  const t = useTranslations("onboarding.run");
  const tJobs = useTranslations("jobs.run");
  const tErrors = useTranslations("errors");
  const tCommon = useTranslations("common");
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

      setJobId(await readStartedJobId(response, { errors: tErrors, failedMessage: tJobs("failed") }));
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : tCommon("unexpectedError"));
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
        throw new Error(t("advanceFailed"));
      }

      setSuccess(t("success"));
      window.setTimeout(() => {
        window.location.assign("/onboarding/review-export");
      }, 450);
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : tCommon("unexpectedError"));
    }
  };

  return (
    <section className="card space-y-4">
      <CardIntro
        variant="step"
        title={t("title")}
        intro={
          <>
            {t("projectLabel")} <span className="font-medium">{projectName}</span> - {t("sectionLabel")}{" "}
            <span className="font-medium">{subprojectName}</span>.
          </>
        }
      />

      <div className="rounded-xl border border-[var(--surface-border)] bg-[var(--surface-muted)] p-4 text-sm text-slate-600">
        {t("info")}
      </div>

      {jobId && <JobProgress key={jobId} jobId={jobId} resultsHref={resultsHref} onCompleted={advanceOnboarding} />}

      <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap">
        <button className="btn-primary w-full sm:w-auto" type="button" onClick={runExtraction} disabled={starting}>
          {starting ? tJobs("running") : t("submit")}
        </button>
        <OnboardingBackLink href="/onboarding/seeds" />
      </div>

      {error && <p className="text-sm text-red-700">{error}</p>}
      {success && <p className="text-sm text-green-700">{success}</p>}
    </section>
  );
}
