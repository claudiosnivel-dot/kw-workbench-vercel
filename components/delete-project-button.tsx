"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ApiErrorPayload, buildApiErrorMessage, readJsonSafe } from "@/lib/client/http";

type DeleteProjectButtonProps = {
  projectId: string;
  projectName: string;
  buttonLabel?: string;
  buttonClassName?: string;
  redirectTo?: string | null;
  showInlineError?: boolean;
};

export function DeleteProjectButton({
  projectId,
  projectName,
  buttonLabel = "Elimina progetto",
  buttonClassName = "btn btn-danger w-full sm:w-auto",
  redirectTo = "/",
  showInlineError = true,
}: DeleteProjectButtonProps) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const remove = async () => {
    const confirmed = window.confirm(
      `Eliminare il progetto "${projectName}"? Verranno rimossi in modo permanente progetto, seed, keyword candidate e job.`
    );

    if (!confirmed) {
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const response = await fetch(`/api/projects/${projectId}`, { method: "DELETE" });
      const payload = await readJsonSafe<ApiErrorPayload>(response);

      if (!response.ok) {
        throw new Error(buildApiErrorMessage(response, payload, "Eliminazione non riuscita"));
      }

      if (redirectTo) {
        router.push(redirectTo);
      }

      router.refresh();
    } catch (deleteError) {
      const message = deleteError instanceof Error ? deleteError.message : "Errore imprevisto";
      setError(message);
      setLoading(false);

      if (!showInlineError) {
        window.alert(message);
      }
    }
  };

  return (
    <div className={showInlineError ? "space-y-2" : ""}>
      <button
        type="button"
        className={buttonClassName}
        onClick={remove}
        disabled={loading}
      >
        {loading ? "Eliminazione..." : buttonLabel}
      </button>
      {showInlineError && error && <p className="text-sm text-red-700">{error}</p>}
    </div>
  );
}