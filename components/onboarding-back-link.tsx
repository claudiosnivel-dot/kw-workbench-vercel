import Link from "next/link";
import { useTranslations } from "next-intl";

/** «Torna allo step precedente» dei passi del percorso guidato (T-1303). */
export function OnboardingBackLink({ href }: { href: string }) {
  const t = useTranslations("onboarding");
  return (
    <Link className="btn-secondary w-full text-center sm:w-auto" href={href}>
      {t("back")}
    </Link>
  );
}
