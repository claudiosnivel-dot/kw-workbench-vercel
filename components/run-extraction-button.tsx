"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ApiErrorPayload, buildApiErrorMessage, readJsonSafe } from "@/lib/client/http";

type RunExtractionButtonProps = {
  projectId?: string;
  runPath?: string;
  label?: string;
  runningLabel?: string;
};

export function RunExtractionButton({
  projectId,
  runPath,
  label = "Avvia estrazione",
  runningLabel = "Estrazione in corso...",
}: RunExtractionButtonProps) {
  const router = useRouter();
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const endpoint = runPath ?? (projectId ? `/api/projects/${projectId}/run` : null);

  const run = async () => {
    if (!endpoint) {
      setError("Endpoint estrazione non configurato");
      return;
    }

    setRunning(true);
    setError(null);

    try {
      const response = await fetch(endpoint, {
        method: "POST",
      });

      const payload = await readJsonSafe<ApiErrorPayload>(response);
      if (!response.ok) {
        throw new Error(buildApiErrorMessage(response, payload, "Estrazione non riuscita"));
      }

      router.refresh();
    } catch (runError) {
      setError(runError instanceof Error ? runError.message : "Errore imprevisto");
    } finally {
      setRunning(false);
    }
  };

  return (
    <div className="w-full space-y-2 sm:w-auto">
      <button type="button" className="btn-primary w-full sm:w-auto" onClick={run} disabled={running || !endpoint}>
        {running ? runningLabel : label}
      </button>
      {error && <p className="text-sm text-red-700">{error}</p>}
    </div>
  );
}
