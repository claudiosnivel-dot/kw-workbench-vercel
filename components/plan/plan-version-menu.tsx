"use client";

import { useTranslations } from "next-intl";
import { EntityMenu } from "@/components/entity-menu";

/** Menu ⋯ di una versione precedente del piano (T-2502): «Elimina» con la conferma; il piano corrente non cambia. */
export function PlanVersionMenu({ projectId, version, redirectTo }: { projectId: string; version: { id: string; name: string }; redirectTo: string }) {
  const t = useTranslations("plan.versionsPage");
  return (
    <EntityMenu
      label={t("menu", { name: version.name })}
      items={[
        {
          kind: "delete",
          label: t("delete"),
          dialog: {
            labels: { title: t("deleteTitle"), text: t("deleteText", { name: version.name }), cancel: t("cancel"), confirm: t("delete") },
            endpoint: `/api/projects/${projectId}/strategies/${version.id}`,
            redirectTo,
          },
        },
      ]}
    />
  );
}
