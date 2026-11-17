"use client";

import { useTranslations } from "next-intl";
import { DialogActions } from "@/components/dialog-actions";
import { ModalDialog } from "@/components/modal-dialog";

/**
 * Conferma della card «Claude Code» (T-7102) con l'avviso: «replace» crea una chiave nuova e spegne quella attiva,
 * «revoke» la revoca. Il rosso compare solo nel dialogo della revoca; un errore resta nel dialogo.
 */
export function AgentKeyConfirmDialog({
  kind,
  prefix,
  pending,
  error,
  onConfirm,
  onClose,
}: {
  kind: "replace" | "revoke";
  prefix: string;
  pending: boolean;
  error: string | null;
  onConfirm: () => void;
  onClose: () => void;
}) {
  const t = useTranslations("admin.agentKey");

  return (
    <ModalDialog title={t(`${kind}Title`)} onClose={onClose}>
      <div className="agent-key-dialog space-y-4">
        <p className="text-sm text-slate-600">{t(`${kind}Text`, { prefix })}</p>
        <DialogActions error={error} cancel={{ label: t("cancel"), onClick: onClose, disabled: pending }}>
          <button type="button" className={kind === "revoke" ? "btn-danger" : "btn-primary"} disabled={pending} onClick={onConfirm}>
            {pending ? t(kind === "revoke" ? "revoking" : "creating") : t(`${kind}Confirm`)}
          </button>
        </DialogActions>
      </div>
    </ModalDialog>
  );
}
