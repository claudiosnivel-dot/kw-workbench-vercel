"use client";

import { useTranslations } from "next-intl";
import type { ChangeEvent } from "react";
import { usePreferencePost } from "@/lib/client/use-preference-post";

export type WorkspaceOption = { id: string; name: string; isPersonal: boolean };

/**
 * Selettore del workspace attivo (T-1504): salva la scelta con POST /api/workspaces/active (cookie kwb_workspace,
 * riverificato dal server a ogni richiesta) e ricarica i dati della pagina.
 */
export function WorkspaceSwitcher({
  workspaces,
  activeId,
  className,
}: {
  workspaces: WorkspaceOption[];
  activeId: string;
  className?: string;
}) {
  const t = useTranslations("workspace.switcher");
  const { saving, save } = usePreferencePost();

  async function changeWorkspace(event: ChangeEvent<HTMLSelectElement>) {
    if (event.target.value !== activeId) {
      await save("/api/workspaces/active", { workspaceId: event.target.value });
    }
  }

  return (
    <select
      aria-label={t("label")}
      value={activeId}
      onChange={changeWorkspace}
      disabled={saving}
      className={["select workspace-switcher", className].filter(Boolean).join(" ")}
    >
      {workspaces.map((workspace) => (
        <option key={workspace.id} value={workspace.id}>
          {workspace.isPersonal ? t("personal", { name: workspace.name }) : workspace.name}
        </option>
      ))}
    </select>
  );
}
