"use client";

import { useTranslations } from "next-intl";
import { type FormEvent, useId, useState } from "react";
import { DialogActions } from "@/components/dialog-actions";
import { ModalDialog } from "@/components/modal-dialog";
import { sendJson } from "@/lib/client/http";
import { useRefreshAction } from "@/lib/client/use-refresh-action";

/**
 * Finestra «Nuovo workspace» del menu dell'utente (T-3103): il solo nome e «Crea», con POST /api/workspaces (T-2008, che
 * rende attivo il nuovo workspace) e il refresh della pagina. La validazione del nome è della rotta: un errore resta
 * nella finestra, in un elemento role alert.
 */
export function NewWorkspaceDialog({ onClose }: { onClose: () => void }) {
  const t = useTranslations("workspace.create");
  const { loading, error, run } = useRefreshAction();
  const nameId = useId();
  const [name, setName] = useState("");

  const create = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    // run restituisce null quando la rotta risponde 201 e la pagina si aggiorna con il nuovo workspace attivo.
    void run(() => sendJson("POST", "/api/workspaces", { name })).then((failure) => {
      if (failure === null) {
        onClose();
      }
    });
  };

  return (
    <ModalDialog title={t("title")} onClose={onClose}>
      <form className="space-y-4" onSubmit={create}>
        <div>
          <label htmlFor={nameId} className="label">
            {t("label")}
          </label>
          <input id={nameId} className="input" maxLength={80} value={name} onChange={(event) => setName(event.target.value)} />
        </div>
        <DialogActions error={error} cancel={{ label: t("cancel"), onClick: onClose, disabled: loading }}>
          <button type="submit" className="btn-primary" disabled={loading}>
            {loading ? t("submitting") : t("submit")}
          </button>
        </DialogActions>
      </form>
    </ModalDialog>
  );
}
