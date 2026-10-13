"use client";

import { useTranslations } from "next-intl";
import { useState } from "react";
import { EntityMenu, type EntityMenuItem } from "@/components/entity-menu";
import { TopicSeedsDialog } from "@/components/topic-seeds-dialog";

type TopicActionsProps = {
  projectId: string;
  topic: { id: string; name: string; seeds: string[] };
  /** section.write nel workspace (D-08): rinomina ed elimina; la rotta resta protetta lato server (T-1502). */
  canEdit: boolean;
};

// Limite del nome di una sezione (T-809, D-24).
const TOPIC_NAME_MAX_LENGTH = 120;

/**
 * Azioni dell'intestazione di un argomento (T-2403, T-2404): «+ Trova altre keyword» apre le parole di partenza con il
 * focus sul campo di aggiunta; il menu ⋯ ha Parole di partenza, Rinomina (PATCH del nome) ed Elimina con un dialogo di
 * conferma. Eliminato l'argomento, si torna al progetto.
 */
export function TopicActions({ projectId, topic, canEdit }: TopicActionsProps) {
  const t = useTranslations("keywords");
  const [seedsOpen, setSeedsOpen] = useState(false);
  const endpoint = `/api/projects/${projectId}/subprojects/${topic.id}`;
  const items: EntityMenuItem[] = [{ kind: "action", label: t("menuSeeds"), onSelect: () => setSeedsOpen(true) }];
  if (canEdit) {
    items.push(
      {
        kind: "rename",
        label: t("menuRename"),
        dialog: {
          labels: { title: t("rename.title"), field: t("rename.label"), cancel: t("rename.cancel"), save: t("rename.save") },
          initialName: topic.name,
          maxLength: TOPIC_NAME_MAX_LENGTH,
          endpoint,
        },
      },
      {
        kind: "delete",
        label: t("menuDelete"),
        dialog: {
          labels: {
            title: t("delete.title"),
            text: t("delete.text", { name: topic.name }),
            cancel: t("delete.cancel"),
            confirm: t("delete.confirm"),
          },
          endpoint,
          redirectTo: `/projects/${projectId}`,
        },
      }
    );
  }

  return (
    <div className="flex shrink-0 items-center gap-2">
      <button type="button" className="btn-secondary" onClick={() => setSeedsOpen(true)}>
        {t("findMore")}
      </button>
      <EntityMenu label={t("menu", { name: topic.name })} items={items} />
      {seedsOpen && (
        <TopicSeedsDialog projectId={projectId} topicId={topic.id} seeds={topic.seeds} onClose={() => setSeedsOpen(false)} />
      )}
    </div>
  );
}
