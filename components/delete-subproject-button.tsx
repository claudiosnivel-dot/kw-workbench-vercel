"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ApiErrorPayload, buildApiErrorMessage, readJsonSafe } from "@/lib/client/http";

type DeleteSubprojectButtonProps = {
  projectId: string;
  subprojectId: string;
  subprojectName: string;
  buttonLabel?: string;
  buttonClassName?: string;
  showInlineError?: boolean;
  redirectTo?: string | null;
};

export function DeleteSubprojectButton({
  projectId,
  subprojectId,
  subprojectName,
  buttonLabel = "Elimina",
  buttonClassName = "btn-danger",
  showInlineError = true,
  redirectTo = null,
}: DeleteSubprojectButtonProps) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const remove = async () => {
    const confirmed = window.confirm(`Eliminare la sezione "${subprojectName}"? Verranno rimossi seed, keyword e job collegati.`);

    if (!confirmed) {
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const response = await fetch(`/api/projects/${projectId}/subprojects/${subprojectId}`, {
        method: "DELETE",
      });
      const payload = await readJsonSafe<ApiErrorPayload>(response);

      if (!response.ok) {
        throw new Error(buildApiErrorMessage(response, payload, "Eliminazione sezione non riuscita"));
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
      <button type="button" className={buttonClassName} disabled={loading} onClick={remove}>
        {loading ? "Eliminazione..." : buttonLabel}
      </button>
      {showInlineError && error && <p className="text-sm text-red-700">{error}</p>}
    </div>
  );
}

