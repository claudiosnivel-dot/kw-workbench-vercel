"use client";

import { type FormEvent, useId, useState } from "react";
import { ModalDialog } from "@/components/modal-dialog";
import { sendJson } from "@/lib/client/http";
import { useRefreshAction } from "@/lib/client/use-refresh-action";

export type RenameDialogProps = {
  /** Testi già tradotti da chi apre il dialogo; description è l'etichetta del campo Descrizione. */
  labels: { title: string; field: string; cancel: string; save: string; description?: string };
  initialName: string;
  maxLength: number;
  /** Descrizione salvata di un argomento (T-2701): con questa prop il dialogo mostra anche il campo Descrizione. */
  description?: string;
  /** Rotta che riceve la PATCH con { name } oppure { name, description }. */
  endpoint: string;
  onClose: () => void;
};

// Limite della descrizione di una sezione (T-809, D-24).
const DESCRIPTION_MAX_LENGTH = 1000;

/**
 * Dialogo Rinomina di un progetto (T-2305) o «Nome e descrizione» di un argomento (T-2403, T-2701): PATCH del nome e,
 * per l'argomento, della descrizione (null se vuota), refresh della pagina e chiusura; un errore resta sotto il campo
 * del nome con il testo del catalogo.
 */
export function RenameDialog({ labels, initialName, maxLength, description, endpoint, onClose }: RenameDialogProps) {
  const fieldId = useId();
  const descriptionId = useId();
  const [name, setName] = useState(initialName);
  const [descriptionValue, setDescriptionValue] = useState(description ?? "");
  const { loading, error, run } = useRefreshAction();

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const body =
      description === undefined ? { name: name.trim() } : { name: name.trim(), description: descriptionValue.trim() || null };
    if ((await run(() => sendJson("PATCH", endpoint, body))) === null) {
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
        {description !== undefined && (
          <div>
            <label className="label" htmlFor={descriptionId}>
              {labels.description}
            </label>
            <textarea
              id={descriptionId}
              className="input min-h-24"
              value={descriptionValue}
              maxLength={DESCRIPTION_MAX_LENGTH}
              onChange={(event) => setDescriptionValue(event.target.value)}
            />
          </div>
        )}
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
