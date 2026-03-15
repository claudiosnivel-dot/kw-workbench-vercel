"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ApiErrorPayload, buildApiErrorMessage, readJsonSafe } from "@/lib/client/http";

type SectionOrderButtonsProps = {
  projectId: string;
  subprojectId: string;
  disableUp?: boolean;
  disableDown?: boolean;
};

export function SectionOrderButtons({
  projectId,
  subprojectId,
  disableUp = false,
  disableDown = false,
}: SectionOrderButtonsProps) {
  const router = useRouter();
  const [loadingDirection, setLoadingDirection] = useState<"up" | "down" | null>(null);
  const [error, setError] = useState<string | null>(null);

  const move = async (direction: "up" | "down") => {
    if (loadingDirection || (direction === "up" ? disableUp : disableDown)) {
      return;
    }

    setLoadingDirection(direction);
    setError(null);

    try {
      const response = await fetch(`/api/projects/${projectId}/subprojects/reorder`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ subprojectId, direction }),
      });

      const payload = await readJsonSafe<ApiErrorPayload>(response);
      if (!response.ok) {
        throw new Error(buildApiErrorMessage(response, payload, "Riordino sezioni non riuscito"));
      }

      router.refresh();
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Errore imprevisto");
    } finally {
      setLoadingDirection(null);
    }
  };

  return (
    <div className="space-y-2">
      <div className="flex gap-2">
        <button
          type="button"
          className="btn-secondary"
          onClick={() => move("up")}
          disabled={disableUp || loadingDirection !== null}
          title="Sposta in alto"
        >
          ?
        </button>
        <button
          type="button"
          className="btn-secondary"
          onClick={() => move("down")}
          disabled={disableDown || loadingDirection !== null}
          title="Sposta in basso"
        >
          ?
        </button>
      </div>
      {error && <p className="text-sm text-red-700">{error}</p>}
    </div>
  );
}

