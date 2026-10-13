import { useSyncExternalStore } from "react";
import { OPTIONAL_KEYWORD_COLUMNS, type OptionalKeywordColumn } from "@/lib/modules/keywords-options";

/** Chiave del localStorage con le colonne facoltative scelte nell'elenco delle keyword (T-2403). */
const STORAGE_KEY = "titan_keyword_columns";
// Evento della stessa scheda: l'evento storage arriva solo alle altre schede.
const CHANGE_EVENT = "titan-keyword-columns";

function subscribe(onChange: () => void): () => void {
  window.addEventListener("storage", onChange);
  window.addEventListener(CHANGE_EVENT, onChange);
  return () => {
    window.removeEventListener("storage", onChange);
    window.removeEventListener(CHANGE_EVENT, onChange);
  };
}

function readStored(): string {
  try {
    return window.localStorage.getItem(STORAGE_KEY) ?? "";
  } catch {
    return "";
  }
}

/**
 * Colonne facoltative mostrate (T-2403): nascoste di default, la scelta resta nel localStorage del browser. Il server e
 * la prima resa nel browser le mostrano tutte nascoste, poi si legge la scelta salvata (niente differenze di idratazione).
 */
export function useStoredColumns(): [Set<OptionalKeywordColumn>, (column: OptionalKeywordColumn, shown: boolean) => void] {
  const stored = useSyncExternalStore(subscribe, readStored, () => "");
  const shown = new Set(OPTIONAL_KEYWORD_COLUMNS.filter((column) => stored.split(",").includes(column)));

  const toggle = (column: OptionalKeywordColumn, visible: boolean) => {
    const next = OPTIONAL_KEYWORD_COLUMNS.filter((item) => (item === column ? visible : shown.has(item)));
    try {
      window.localStorage.setItem(STORAGE_KEY, next.join(","));
    } catch {
      // Storage non disponibile (navigazione privata): la scelta vale fino al ricaricamento.
    }
    window.dispatchEvent(new Event(CHANGE_EVENT));
  };

  return [shown, toggle];
}
