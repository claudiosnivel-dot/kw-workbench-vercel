"use client";

import { useState } from "react";

/**
 * Id scelti con le caselle di un dialogo (T-6802 «Porta con te anche», T-7001 «Scegli le città da scartare»): toggle
 * aggiunge o toglie un id, clear svuota la scelta.
 */
export function useCheckedSet() {
  const [checked, setChecked] = useState<Set<string>>(new Set());
  const toggle = (id: string, on: boolean) =>
    setChecked((current) => {
      const next = new Set(current);
      if (on) next.add(id);
      else next.delete(id);
      return next;
    });
  return { checked, toggle, clear: () => setChecked(new Set()) };
}
