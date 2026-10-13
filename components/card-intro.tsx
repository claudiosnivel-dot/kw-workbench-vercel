import type { ReactNode } from "react";

type CardIntroProps = {
  title: ReactNode;
  intro?: ReactNode;
};

/**
 * Titolo e testo introduttivo di una card (T-1303): un solo markup per le card delle impostazioni e dell'admin. Le
 * varianti dei passi dell'onboarding sono andate via con l'onboarding (T-2306).
 */
export function CardIntro({ title, intro }: CardIntroProps) {
  return (
    <div>
      <h2 className="text-lg font-semibold">{title}</h2>
      {intro ? <p className="text-sm text-slate-600">{intro}</p> : null}
    </div>
  );
}
