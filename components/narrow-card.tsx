import type { ReactNode } from "react";

/**
 * Card stretta al centro della pagina con titolo h1 (T-1303): accesso, registrazione e pagine d'errore. action si
 * affianca al titolo (per esempio il selettore della lingua).
 */
export function NarrowCard({ title, action, children }: { title: ReactNode; action?: ReactNode; children: ReactNode }) {
  const heading = <h1 className="text-2xl font-semibold">{title}</h1>;

  return (
    <div className="mx-auto max-w-lg">
      <div className="card space-y-4">
        {action ? (
          <div className="flex items-start justify-between gap-3">
            {heading}
            {action}
          </div>
        ) : (
          heading
        )}
        {children}
      </div>
    </div>
  );
}
