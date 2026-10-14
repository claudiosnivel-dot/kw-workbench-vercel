"use client";

import { useId, useState } from "react";
import { DialogActions } from "@/components/dialog-actions";
import { ModalDialog } from "@/components/modal-dialog";
import type { PlanRequestResult } from "@/components/plan/plan-requests";

export type PickOption = { id: string; label: string };
export type PickGroup = { label: string; options: PickOption[] };

type PickDialogProps = {
  /** Testi già tradotti: titolo, etichetta della scelta, Annulla e il pulsante che conferma. */
  labels: { title: string; field: string; cancel: string; confirm: string };
  /** Destinazioni raggruppate (per pagina principale); un gruppo senza etichetta è un elenco semplice. */
  groups: PickGroup[];
  /** Conferma con la destinazione scelta: riuscita chiude il dialogo, altrimenti il messaggio resta nel dialogo. */
  onPick: (id: string) => Promise<PlanRequestResult>;
  onClose: () => void;
};

/**
 * Scelta di una destinazione del piano (T-2504, T-2505): l'alternativa da tastiera e da touch al trascinamento per
 * «Sposta sotto…», «Assegna a…», «Sposta in…» e «Unisci a…». Una select nativa con i gruppi e un pulsante che conferma;
 * le etichette sono testo (CWE-79).
 */
export function PickDialog({ labels, groups, onPick, onClose }: PickDialogProps) {
  const fieldId = useId();
  const [target, setTarget] = useState(groups[0]?.options[0]?.id ?? "");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const confirm = async () => {
    setPending(true);
    const result = await onPick(target);
    setPending(false);
    if (result.ok) onClose();
    else setError(result.message);
  };

  return (
    <ModalDialog title={labels.title} onClose={onClose}>
      <label className="block" htmlFor={fieldId}>
        <span className="label">{labels.field}</span>
        <select id={fieldId} className="select" value={target} onChange={(event) => setTarget(event.target.value)}>
          {groups.map((group) =>
            group.label ? (
              <optgroup key={group.label} label={group.label}>
                {group.options.map((option) => (
                  <option key={option.id} value={option.id}>
                    {option.label}
                  </option>
                ))}
              </optgroup>
            ) : (
              group.options.map((option) => (
                <option key={option.id} value={option.id}>
                  {option.label}
                </option>
              ))
            )
          )}
        </select>
      </label>
      <DialogActions error={error} cancel={{ label: labels.cancel, onClick: onClose }}>
        <button type="button" className="btn-primary" disabled={pending || !target} onClick={() => void confirm()}>
          {labels.confirm}
        </button>
      </DialogActions>
    </ModalDialog>
  );
}
