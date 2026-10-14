"use client";

import { useTranslations } from "next-intl";
import { useState } from "react";
import { CardIntro } from "@/components/card-intro";
import { ConfirmDeleteDialog } from "@/components/confirm-delete-dialog";

/**
 * «Elimina il progetto» in fondo alle impostazioni (T-2602), solo per chi ha project.delete: il pulsante apre la
 * conferma e il rosso compare solo nel dialogo (D-39). La rotta DELETE resta protetta lato server (T-1502).
 */
export function ProjectDeleteCard({ project }: { project: { id: string; name: string } }) {
  const t = useTranslations("projects.settings");
  const tDelete = useTranslations("projects.delete");
  const [open, setOpen] = useState(false);

  return (
    <section className="card space-y-3">
      <CardIntro title={t("deleteTitle")} intro={t("deleteWarning")} />
      <button type="button" className="btn-secondary" onClick={() => setOpen(true)}>
        {t("deleteTitle")}
      </button>
      {open && (
        <ConfirmDeleteDialog
          labels={{ title: t("deleteTitle"), text: tDelete("confirm", { name: project.name }), cancel: t("cancel"), confirm: t("deleteConfirm") }}
          endpoint={`/api/projects/${project.id}`}
          redirectTo="/"
          onClose={() => setOpen(false)}
        />
      )}
    </section>
  );
}
