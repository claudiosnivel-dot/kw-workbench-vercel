import { useState } from "react";

/** Valori di un form con aggiornamento per campo (T-1303): update(campo, valore) mantiene gli altri campi. */
export function useFormValues<V extends object>(initial: V | (() => V)) {
  const [values, setValues] = useState<V>(initial);

  const update = <K extends keyof V>(key: K, value: V[K]) => {
    setValues((current) => ({ ...current, [key]: value }));
  };

  return { values, setValues, update };
}
