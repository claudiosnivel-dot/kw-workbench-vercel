"use client";

import { useTranslations } from "next-intl";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { JobProgress } from "@/components/job-progress";
import { readStartedJobId } from "@/lib/client/run-extraction";

type RunExtractionButtonProps = {
  projectId?: string;
  runPath?: string;
  subprojectId?: string | null;
  label?: string;
  runningLabel?: string;
  /** Pagina dei risultati della sezione, mostrata a estrazione completata. */
  resultsHref: string;
  /** Job pending o running della sezione letto dalla pagina: l'avanzamento resta visibile al ricaricamento. */
  activeJobId?: string | null;
};

export function RunExtractionButton({
  projectId,
  runPath,
  subprojectId = null,
  label,
  runningLabel,
  resultsHref,
  activeJobId = null,
}: RunExtractionButtonProps) {
  const t = useTranslations("jobs.run");
  const tErrors = useTranslations("errors");
  const tCommon = useTranslations("common");
  const router = useRouter();
  const [starting, setStarting] = useState(false);
  const [jobId, setJobId] = useState<string | null>(activeJobId);
  const [error, setError] = useState<string | null>(null);

  const endpoint = runPath ?? (projectId ? `/api/projects/${projectId}/run` : null);

  const run = async () => {
    if (!endpoint) {
      setError(t("endpointMissing"));
      return;
    }

    setStarting(true);
    setError(null);

    try {
      const requestInit: RequestInit = {
        method: "POST",
      };

      if (!runPath && subprojectId) {
        requestInit.headers = { "Content-Type": "application/json" };
        requestInit.body = JSON.stringify({ subprojectId });
      }

      const response = await fetch(endpoint, requestInit);
      // 202 per un job nuovo, 409 JOB_ALREADY_ACTIVE per quello già in corso: in entrambi i casi se ne segue lo stato.
      setJobId(await readStartedJobId(response, { errors: tErrors, failedMessage: t("failed") }));
    } catch (runError) {
      setError(runError instanceof Error ? runError.message : tCommon("unexpectedError"));
    } finally {
      setStarting(false);
    }
  };

  return (
    <div className="w-full space-y-2 sm:w-auto">
      <button type="button" className="btn-primary w-full sm:w-auto" onClick={run} disabled={starting || !endpoint}>
        {starting ? (runningLabel ?? t("running")) : (label ?? t("start"))}
      </button>
      {error && <p className="text-sm text-red-700">{error}</p>}
      {jobId && <JobProgress key={jobId} jobId={jobId} resultsHref={resultsHref} onCompleted={() => router.refresh()} />}
    </div>
  );
}
