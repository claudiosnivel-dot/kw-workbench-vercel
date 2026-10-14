import type { ReactNode } from "react";
import { ExportViewRegistration } from "@/components/export-view-context";
import type { StrategyView } from "@/lib/modules/strategy/types";

type PlanShellProps = {
  strategy: StrategyView;
  title: string;
  /** Riga sotto il titolo dal numero di pagine: data e pagine del piano, o la data della versione in sola lettura. */
  meta: (pageCount: number) => string;
  /** Azioni a destra: Rigenera e menu del piano, o il ritorno alle versioni. */
  actions: ReactNode;
  /** Testi sotto l'intestazione, dentro la sua scheda. */
  intro?: ReactNode;
  /** Bacheca o elenco del piano. */
  children: ReactNode;
};

/**
 * Struttura della pagina del piano e delle sue versioni precedenti (T-2502): registra la strategia aperta per l'Esporta
 * della barra in alto (T-2406), poi intestazione con titolo, riga dei dati e azioni, poi il piano.
 */
export function PlanShell({ strategy, title, meta, actions, intro, children }: PlanShellProps) {
  const pageCount = strategy.hubs.reduce((sum, hub) => sum + 1 + hub.spokes.length, 0);
  return (
    <div className="space-y-6">
      <ExportViewRegistration view={{ plan: { strategyId: strategy.id, pageCount } }} />
      <section className="card space-y-3">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div className="space-y-1">
            <h1 className="text-2xl font-semibold">{title}</h1>
            <p className="text-sm text-slate-600">{meta(pageCount)}</p>
          </div>
          {actions}
        </div>
        {intro}
      </section>
      {children}
    </div>
  );
}
