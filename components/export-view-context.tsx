"use client";

import { createContext, type ReactNode, useContext, useEffect, useState } from "react";

/**
 * Quello che la pagina aperta sa e la barra in alto no (T-2406): la vista filtrata delle keyword con il suo conteggio
 * e i parametri dei filtri, oppure il piano mostrato con il numero di pagine.
 */
export type ExportPageView = {
  keywords?: { count: number; filters: Record<string, string> };
  plan?: { strategyId: string; pageCount: number };
};

type ExportViewState = { view: ExportPageView | null; setView: (view: ExportPageView | null) => void };

const ExportViewContext = createContext<ExportViewState>({ view: null, setView: () => undefined });

/** Contenitore della vista registrata dalla pagina, nella struttura del progetto (T-2303). */
export function ExportViewProvider({ children }: { children: ReactNode }) {
  const [view, setView] = useState<ExportPageView | null>(null);
  return <ExportViewContext.Provider value={{ view, setView }}>{children}</ExportViewContext.Provider>;
}

export function useExportView(): ExportPageView | null {
  return useContext(ExportViewContext).view;
}

/** La pagina registra la sua vista finché resta montata; cambia solo quando cambia il contenuto. */
export function useRegisterExportView(view: ExportPageView | null): void {
  const { setView } = useContext(ExportViewContext);
  const key = JSON.stringify(view);
  useEffect(() => {
    setView(key === "null" ? null : (JSON.parse(key) as ExportPageView));
    return () => setView(null);
  }, [key, setView]);
}

/** Registrazione da una pagina server (per esempio la pagina di una strategia), senza altro contenuto. */
export function ExportViewRegistration({ view }: { view: ExportPageView }) {
  useRegisterExportView(view);
  return null;
}
