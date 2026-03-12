"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ApiErrorPayload, buildApiErrorMessage, readJsonSafe } from "@/lib/client/http";

type DeleteProjectButtonProps = {
  projectId: string;
  projectName: string;
};

export function DeleteProjectButton({ projectId, projectName }: DeleteProjectButtonProps) {
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

      router.push("/");
      router.refresh();
    } catch (deleteError) {
      setError(deleteError instanceof Error ? deleteError.message : "Errore imprevisto");
      setLoading(false);
    }
  };

  return (
    <div className="space-y-2">
      <button
        type="button"
        className="btn inline-flex w-full items-center justify-center rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-500 sm:w-auto"
        onClick={remove}
        disabled={loading}
      >
        {loading ? "Eliminazione..." : "Elimina progetto"}
      </button>
      {error && <p className="text-sm text-red-700">{error}</p>}
    </div>
  );
}
