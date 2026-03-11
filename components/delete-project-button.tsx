"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

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
      const payload = (await response.json()) as { error?: string };
      if (!response.ok) {
        throw new Error(payload.error ?? "Eliminazione non riuscita");
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
        className="btn inline-flex items-center justify-center rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-500"
        onClick={remove}
        disabled={loading}
      >
        {loading ? "Eliminazione..." : "Elimina progetto"}
      </button>
      {error && <p className="text-sm text-red-700">{error}</p>}
    </div>
  );
}