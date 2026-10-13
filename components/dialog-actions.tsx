import type { ReactNode } from "react";

type DialogActionsProps = {
  /** Messaggio d'errore già tradotto, mostrato sopra i pulsanti. */
  error: string | null;
  cancel: { label: string; onClick: () => void; disabled?: boolean };
  /** Pulsanti dell'azione, dopo Annulla. */
  children: ReactNode;
};

/** Fondo di un dialogo (T-2403, T-2404): l'errore e la riga dei pulsanti con Annulla per primo, a destra da 640 px. */
export function DialogActions({ error, cancel, children }: DialogActionsProps) {
  return (
    <>
      {error && (
        <p className="text-sm text-red-700" role="alert">
          {error}
        </p>
      )}
      <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
        <button type="button" className="btn-secondary" onClick={cancel.onClick} disabled={cancel.disabled}>
          {cancel.label}
        </button>
        {children}
      </div>
    </>
  );
}
