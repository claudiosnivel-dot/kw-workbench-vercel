"use client";

import Link from "next/link";
import { useTranslations } from "next-intl";
import { type FormEvent, useId, useState } from "react";
import { ModalDialog } from "@/components/modal-dialog";
import { sendJson } from "@/lib/client/http";
import { useMenuButton } from "@/lib/client/use-menu-button";
import { useRefreshAction } from "@/lib/client/use-refresh-action";

type ProjectCardMenuProps = {
  project: { id: string; name: string };
  /** project.delete nel workspace (ADMIN e OWNER, D-08): la rotta DELETE resta protetta lato server (T-1502). */
  canDelete: boolean;
};

// Limite del nome del progetto (T-809, D-24).
const PROJECT_NAME_MAX_LENGTH = 120;

function RenameDialog({ project, onClose }: { project: ProjectCardMenuProps["project"]; onClose: () => void }) {
  const t = useTranslations("dashboard.card");
  const fieldId = useId();
  const [name, setName] = useState(project.name);
  const { loading, error, run } = useRefreshAction();

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if ((await run(() => sendJson("PATCH", `/api/projects/${project.id}`, { name: name.trim() }))) === null) {
      onClose();
    }
  };

  return (
    <ModalDialog title={t("renameTitle")} onClose={onClose}>
      <form className="space-y-4" onSubmit={submit}>
        <div>
          <label className="label" htmlFor={fieldId}>
            {t("nameLabel")}
          </label>
          <input
            id={fieldId}
            className="input"
            value={name}
            required
            maxLength={PROJECT_NAME_MAX_LENGTH}
            onChange={(event) => setName(event.target.value)}
          />
          {error && (
            <p className="mt-1 text-sm text-red-700" role="alert">
              {error}
            </p>
          )}
        </div>
        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <button type="button" className="btn-secondary" onClick={onClose}>
            {t("cancel")}
          </button>
          <button type="submit" className="btn-primary" disabled={loading}>
            {t("save")}
          </button>
        </div>
      </form>
    </ModalDialog>
  );
}

function DeleteDialog({ project, onClose }: { project: ProjectCardMenuProps["project"]; onClose: () => void }) {
  const t = useTranslations("dashboard.card");
  const tProjects = useTranslations("projects.delete");
  const { loading, error, run } = useRefreshAction();

  return (
    <ModalDialog title={t("deleteTitle")} onClose={onClose}>
      <p className="text-sm text-slate-600">{tProjects("confirm", { name: project.name })}</p>
      {error && (
        <p className="text-sm text-red-700" role="alert">
          {error}
        </p>
      )}
      <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
        <button type="button" className="btn-secondary" onClick={onClose}>
          {t("cancel")}
        </button>
        <button
          type="button"
          className="btn-danger"
          disabled={loading}
          onClick={() => run(() => fetch(`/api/projects/${project.id}`, { method: "DELETE" }), { keepLoadingOnSuccess: true })}
        >
          {t("delete")}
        </button>
      </div>
    </ModalDialog>
  );
}

/**
 * Menu ⋯ della scheda di un progetto nella home (T-2305): Rinomina (dialogo, PATCH del nome), Impostazioni ed Elimina
 * con un dialogo di conferma, solo per chi ha project.delete. Il rosso compare solo nel dialogo (D-39).
 */
export function ProjectCardMenu({ project, canDelete }: ProjectCardMenuProps) {
  const t = useTranslations("dashboard.card");
  const { open: menuOpen, close, onKeyDown, wrapperRef, buttonRef, menuRef, buttonProps, menuProps } = useMenuButton();
  const [dialog, setDialog] = useState<"rename" | "delete" | null>(null);

  const openDialog = (kind: "rename" | "delete") => {
    close();
    setDialog(kind);
  };

  // I dialoghi stanno fuori dal contenitore del menu: i tasti dei loro campi non devono muovere il menu.
  return (
    <>
      <div ref={wrapperRef} className="relative" onKeyDown={onKeyDown}>
        <button ref={buttonRef} {...buttonProps} aria-label={t("menu", { name: project.name })} className="project-switcher-button">
          <span aria-hidden="true">⋯</span>
        </button>
        {menuOpen && (
          <div className="user-menu-popover">
            <div ref={menuRef} {...menuProps} aria-label={t("menu", { name: project.name })} className="grid gap-0.5">
              <button type="button" role="menuitem" tabIndex={-1} className="user-menu-item" onClick={() => openDialog("rename")}>
                {t("rename")}
              </button>
              <Link
                href={`/projects/${project.id}/settings`}
                role="menuitem"
                tabIndex={-1}
                className="user-menu-item"
                onClick={close}
              >
                {t("settings")}
              </Link>
              {canDelete && (
                <button
                  type="button"
                  role="menuitem"
                  tabIndex={-1}
                  className="user-menu-item text-red-700"
                  onClick={() => openDialog("delete")}
                >
                  {t("delete")}
                </button>
              )}
            </div>
          </div>
        )}
      </div>
      {dialog === "rename" && <RenameDialog project={project} onClose={() => setDialog(null)} />}
      {dialog === "delete" && <DeleteDialog project={project} onClose={() => setDialog(null)} />}
    </>
  );
}
