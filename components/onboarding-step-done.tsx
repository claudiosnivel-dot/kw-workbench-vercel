import Link from "next/link";
import { useTranslations } from "next-intl";
import { CardIntro } from "@/components/card-intro";

type OnboardingStepDoneProps = {
  /** Progetto (passo 2) o sezione (passo 4) già creati. */
  kind: "project" | "section";
  name: string;
  continuePath: string;
};

/** Passo già completato (T-1001, T-1002): mostra l'entità creata e prosegue senza crearne un'altra. */
export function OnboardingStepDone({ kind, name, continuePath }: OnboardingStepDoneProps) {
  const t = useTranslations("onboarding");
  return (
    <section className="card space-y-4">
      <CardIntro
        variant="step"
        title={t(`done.${kind}Heading`)}
        intro={
          <>
            {t(`done.${kind}Label`)}: <span className="font-medium">{name}</span>.
          </>
        }
      />
      <Link className="btn-primary w-full text-center sm:w-auto" href={continuePath}>
        {t("continue")}
      </Link>
    </section>
  );
}
