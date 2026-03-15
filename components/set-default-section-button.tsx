"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ApiErrorPayload, buildApiErrorMessage, readJsonSafe } from "@/lib/client/http";

type SetDefaultSectionButtonProps = {
  projectId: string;
  subprojectId: string;
  isDefault: boolean;
};

export function SetDefaultSectionButton({ projectId, subprojectId, isDefault }: SetDefaultSectionButtonProps) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async () => {
    if (isDefault || loading) return;

    setLoading(true);
    setError(null);

    try {
      const response = await fetch(`/api/projects/${projectId}/default-subproject`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ subprojectId }),
      });

      const payload = await readJsonSafe<ApiErrorPayload>(response);
      if (!response.ok) {
        throw new Error(buildApiErrorMessage(response, payload, "Salvataggio sezione predefinita non riuscito"));
      }

      router.refresh();
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Errore imprevisto");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-2">
      <button
        type="button"
        className={isDefault ? "btn-secondary" : "btn-primary"}
        onClick={submit}
        disabled={isDefault || loading}
      >
        {isDefault ? "Sezione predefinita" : loading ? "Salvataggio..." : "Imposta come predefinita"}
      </button>
      {error && <p className="text-sm text-red-700">{error}</p>}
    </div>
  );
}

