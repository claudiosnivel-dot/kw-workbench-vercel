import Link from "next/link";

type OnboardingStepDoneProps = {
  heading: string;
  label: string;
  name: string;
  continuePath: string;
};

/** Passo già completato (T-1001, T-1002): mostra l'entità creata e prosegue senza crearne un'altra. */
export function OnboardingStepDone({ heading, label, name, continuePath }: OnboardingStepDoneProps) {
  return (
    <section className="card space-y-4">
      <h2 className="text-xl font-semibold">{heading}</h2>
      <p className="text-sm text-slate-600">
        {label}: <span className="font-medium">{name}</span>.
      </p>
      <Link className="btn-primary w-full text-center sm:w-auto" href={continuePath}>
        Continua
      </Link>
    </section>
  );
}
