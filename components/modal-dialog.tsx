"use client";

import { type ReactNode, useId, useRef } from "react";
import { createPortal } from "react-dom";
import { useModalFocus } from "@/lib/client/use-modal-focus";

/**
 * Dialogo modale (T-2303, T-2305): titolo, focus trattenuto, Esc o clic fuori per chiudere, focus restituito
 * all'elemento che l'ha aperto. Chi lo apre lo monta e lo smonta, così ogni apertura riparte dallo stato iniziale. Si
 * rende nel body (T-2403): dentro una scheda, il suo backdrop-filter farebbe da contenitore alla posizione fissa.
 */
export function ModalDialog({ title, onClose, children }: { title: string; onClose: () => void; children: ReactNode }) {
  const titleId = useId();
  const dialogRef = useRef<HTMLDivElement>(null);
  useModalFocus(true, dialogRef, onClose);

  return createPortal(
    <div className="modal-backdrop" onClick={onClose}>
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="card modal-panel space-y-4"
        onClick={(event) => event.stopPropagation()}
      >
        <h2 id={titleId} className="text-lg font-semibold">
          {title}
        </h2>
        {children}
      </div>
    </div>,
    document.body
  );
}
