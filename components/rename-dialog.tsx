"use client";

import { type FormEvent, useId, useState } from "react";
import { ModalDialog } from "@/components/modal-dialog";
import { sendJson } from "@/lib/client/http";
import { useRefreshAction } from "@/lib/client/use-refresh-action";

export type RenameDialogProps = {
  /** Testi già tradotti da chi apre il dialogo. */
  labels: { title: string; field: string; cancel: string; save: string };
  initialName: string;
  maxLength: number;
  /** Rotta che riceve la PATCH con { name }. */
  endpoint: string;
  onClose: () => void;
};

/**
 * Dialogo Rinomina di un progetto (T-2305) o di un argomento (T-2403): PATCH del nome, refresh della pagina e chiusura;
 * un errore resta sotto il campo con il testo del catalogo.
 */
export function RenameDialog({ labels, initialName, maxLength, endpoint, onClose }: RenameDialogProps) {
  const fieldId = useId();
  const [name, setName] = useState(initialName);
  const { loading, error, run } = useRefreshAction();

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if ((await run(() => sendJson("PATCH", endpoint, { name: name.trim() }))) === null) {
      onClose();
    }
  };

  return (
    <ModalDialog title={labels.title} onClose={onClose}>
      <form className="space-y-4" onSubmit={submit}>
        <div>
          <label className="label" htmlFor={fieldId}>
            {labels.field}
          </label>
          <input
            id={fieldId}
            className="input"
            value={name}
            required
            maxLength={maxLength}
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
            {labels.cancel}
          </button>
          <button type="submit" className="btn-primary" disabled={loading}>
            {labels.save}
          </button>
        </div>
      </form>
    </ModalDialog>
  );
}
