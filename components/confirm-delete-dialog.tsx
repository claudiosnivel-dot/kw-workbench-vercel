"use client";

import { DialogActions } from "@/components/dialog-actions";
import { ModalDialog } from "@/components/modal-dialog";
import { useRefreshAction } from "@/lib/client/use-refresh-action";

export type ConfirmDeleteDialogProps = {
  /** Testi già tradotti da chi apre il dialogo. */
  labels: { title: string; text: string; cancel: string; confirm: string };
  /** Rotta che riceve la DELETE. */
  endpoint: string;
  /** Pagina da aprire dopo l'eliminazione, se quella corrente non esiste più. */
  redirectTo?: string;
  onClose: () => void;
};

/**
 * Conferma dell'eliminazione di un progetto (T-2305) o di un argomento (T-2403): il rosso compare solo qui (D-39). Dopo
 * la DELETE la pagina si aggiorna o porta a redirectTo; un errore resta nel dialogo con il testo del catalogo.
 */
export function ConfirmDeleteDialog({ labels, endpoint, redirectTo, onClose }: ConfirmDeleteDialogProps) {
  const { loading, error, run } = useRefreshAction();

  return (
    <ModalDialog title={labels.title} onClose={onClose}>
      <p className="text-sm text-slate-600">{labels.text}</p>
      <DialogActions error={error} cancel={{ label: labels.cancel, onClick: onClose }}>
        <button
          type="button"
          className="btn-danger"
          disabled={loading}
          onClick={() => run(() => fetch(endpoint, { method: "DELETE" }), { redirectTo, keepLoadingOnSuccess: true })}
        >
          {labels.confirm}
        </button>
      </DialogActions>
    </ModalDialog>
  );
}
