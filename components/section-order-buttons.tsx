"use client";

import { useTranslations } from "next-intl";
import { useRefreshAction } from "@/lib/client/use-refresh-action";

type SectionOrderButtonsProps = {
  projectId: string;
  subprojectId: string;
  subprojectName: string;
  disableUp?: boolean;
  disableDown?: boolean;
};

export function SectionOrderButtons({
  projectId,
  subprojectId,
  subprojectName,
  disableUp = false,
  disableDown = false,
}: SectionOrderButtonsProps) {
  const t = useTranslations("sections.order");
  const { loading, error, run } = useRefreshAction();

  const move = async (direction: "up" | "down") => {
    if (loading || (direction === "up" ? disableUp : disableDown)) {
      return;
    }

    await run(() =>
      fetch(`/api/projects/${projectId}/subprojects/reorder`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ subprojectId, direction }),
      })
    );
  };

  return (
    <div className="space-y-2">
      <div className="flex gap-2">
        <button
          type="button"
          className="btn-secondary"
          onClick={() => move("up")}
          disabled={disableUp || loading}
          aria-label={t("moveUp", { name: subprojectName })}
          title={t("moveUp", { name: subprojectName })}
        >
          {"↑"}
        </button>
        <button
          type="button"
          className="btn-secondary"
          onClick={() => move("down")}
          disabled={disableDown || loading}
          aria-label={t("moveDown", { name: subprojectName })}
          title={t("moveDown", { name: subprojectName })}
        >
          {"↓"}
        </button>
      </div>
      {error && <p className="text-sm text-red-700">{error}</p>}
    </div>
  );
}
