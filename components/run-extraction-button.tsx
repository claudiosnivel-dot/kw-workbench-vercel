"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ApiErrorPayload, buildApiErrorMessage, readJsonSafe } from "@/lib/client/http";

type RunExtractionButtonProps = {
  projectId: string;
};

export function RunExtractionButton({ projectId }: RunExtractionButtonProps) {
  const router = useRouter();
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const run = async () => {
    setRunning(true);
    setError(null);

    try {
      const response = await fetch(`/api/projects/${projectId}/run`, {
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
      <button type="button" className="btn-primary w-full sm:w-auto" onClick={run} disabled={running}>
        {running ? "Estrazione in corso..." : "Avvia estrazione"}
      </button>
      {error && <p className="text-sm text-red-700">{error}</p>}
    </div>
  );
}
