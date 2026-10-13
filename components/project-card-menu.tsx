"use client";

import { useTranslations } from "next-intl";
import { EntityMenu, type EntityMenuItem } from "@/components/entity-menu";

type ProjectCardMenuProps = {
  project: { id: string; name: string };
  /** project.delete nel workspace (ADMIN e OWNER, D-08): la rotta DELETE resta protetta lato server (T-1502). */
  canDelete: boolean;
};

// Limite del nome del progetto (T-809, D-24).
const PROJECT_NAME_MAX_LENGTH = 120;

/**
 * Menu ⋯ della scheda di un progetto nella home (T-2305): Rinomina (dialogo, PATCH del nome), Impostazioni ed Elimina
 * con un dialogo di conferma, solo per chi ha project.delete. Il rosso compare solo nel dialogo (D-39).
 */
export function ProjectCardMenu({ project, canDelete }: ProjectCardMenuProps) {
  const t = useTranslations("dashboard.card");
  const tProjects = useTranslations("projects.delete");
  const endpoint = `/api/projects/${project.id}`;
  const items: EntityMenuItem[] = [
    {
      kind: "rename",
      label: t("rename"),
      dialog: {
        labels: { title: t("renameTitle"), field: t("nameLabel"), cancel: t("cancel"), save: t("save") },
        initialName: project.name,
        maxLength: PROJECT_NAME_MAX_LENGTH,
        endpoint,
      },
    },
    { kind: "link", label: t("settings"), href: `/projects/${project.id}/settings` },
  ];
  if (canDelete) {
    items.push({
      kind: "delete",
      label: t("delete"),
      dialog: {
        labels: { title: t("deleteTitle"), text: tProjects("confirm", { name: project.name }), cancel: t("cancel"), confirm: t("delete") },
        endpoint,
      },
    });
  }

  return <EntityMenu label={t("menu", { name: project.name })} items={items} />;
}
