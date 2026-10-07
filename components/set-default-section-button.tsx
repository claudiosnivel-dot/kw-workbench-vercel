"use client";

import { useTranslations } from "next-intl";
import { useRefreshAction } from "@/lib/client/use-refresh-action";

type SetDefaultSectionButtonProps = {
  projectId: string;
  subprojectId: string;
  isDefault: boolean;
};

export function SetDefaultSectionButton({ projectId, subprojectId, isDefault }: SetDefaultSectionButtonProps) {
  const t = useTranslations("sections.default");
  const tCommon = useTranslations("common");
  const { loading, error, run } = useRefreshAction();

  const submit = async () => {
    if (isDefault || loading) return;

    await run(
      () =>
        fetch(`/api/projects/${projectId}/default-subproject`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ subprojectId }),
        })
    );
  };

  return (
    <div className="space-y-2">
      <button
        type="button"
        className={isDefault ? "btn-secondary" : "btn-primary"}
        onClick={submit}
        disabled={isDefault || loading}
      >
        {isDefault ? t("isDefault") : loading ? tCommon("saving") : t("setDefault")}
      </button>
      {error && <p className="text-sm text-red-700">{error}</p>}
    </div>
  );
}
