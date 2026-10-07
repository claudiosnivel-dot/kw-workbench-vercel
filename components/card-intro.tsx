import type { ReactNode } from "react";

type CardIntroProps = {
  title: ReactNode;
  intro?: ReactNode;
  /**
   * card: titolo text-lg e testo raggruppati (card delle impostazioni); step: titolo text-xl dei passi dell'onboarding,
   * spaziati dalla card; stepGroup: come step ma raggruppati e vicini (benvenuto e revisione dell'onboarding).
   */
  variant?: "card" | "step" | "stepGroup";
};

/** Titolo e testo introduttivo di una card (T-1303): un solo markup per le card delle impostazioni e dell'onboarding. */
export function CardIntro({ title, intro, variant = "card" }: CardIntroProps) {
  const text = intro ? <p className="text-sm text-slate-600">{intro}</p> : null;

  if (variant === "card") {
    return (
      <div>
        <h2 className="text-lg font-semibold">{title}</h2>
        {text}
      </div>
    );
  }

  const heading = <h2 className="text-xl font-semibold">{title}</h2>;
  if (variant === "stepGroup") {
    return (
      <div className="space-y-2">
        {heading}
        {text}
      </div>
    );
  }

  return (
    <>
      {heading}
      {text}
    </>
  );
}
