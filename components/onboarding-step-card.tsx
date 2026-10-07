import type { ReactNode } from "react";
import { CardIntro } from "@/components/card-intro";

type OnboardingStepCardProps = {
  title: ReactNode;
  /** «Progetto attivo:» o «Sezione attiva:», seguito dal nome. */
  contextLabel: ReactNode;
  contextName: string;
  hint?: ReactNode;
  children: ReactNode;
};

/** Passo del percorso guidato con un form (T-1303): titolo, progetto o sezione attiva e contenuto del passo. */
export function OnboardingStepCard({ title, contextLabel, contextName, hint, children }: OnboardingStepCardProps) {
  return (
    <section className="card space-y-4">
      <CardIntro
        variant="step"
        title={title}
        intro={
          <>
            {contextLabel} <span className="font-medium">{contextName}</span>.{hint ? <> {hint}</> : null}
          </>
        }
      />
      {children}
    </section>
  );
}
