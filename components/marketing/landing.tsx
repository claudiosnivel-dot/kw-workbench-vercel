import Link from "next/link";
import { getTranslations } from "next-intl/server";
import type { AppLocale } from "@/lib/i18n/locale";
import { marketingPath } from "@/lib/marketing/routes";

const FEATURES = ["expansion", "classification", "metrics", "export"] as const;
const STEPS = ["project", "seeds", "review"] as const;

/**
 * Landing pubblica (T-1801): testi dai cataloghi della lingua del percorso, rivedibili dall'utente, senza affermazioni su
 * clienti, numeri o certificazioni. Nessun link alle pagine dell'app: solo registrazione, accesso e prezzi.
 */
export async function Landing({ locale }: { locale: AppLocale }) {
  const t = await getTranslations({ locale, namespace: "marketing.landing" });

  return (
    <div className="space-y-6">
      <section className="card overflow-hidden">
        <div className="max-w-3xl space-y-4 py-4">
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-emerald-700">{t("eyebrow")}</p>
          <h1 className="text-3xl font-semibold leading-tight sm:text-5xl sm:leading-[1.1]">{t("title")}</h1>
          <p className="text-base text-slate-600 sm:text-lg">{t("intro")}</p>
          <div className="flex flex-col gap-2 pt-2 sm:flex-row sm:flex-wrap">
            <Link href="/register" className="btn-primary w-full text-center sm:w-auto">
              {t("register")}
            </Link>
            <Link href={marketingPath("pricing", locale)} className="btn-secondary w-full text-center sm:w-auto">
              {t("pricing")}
            </Link>
            <Link href="/login" className="btn-secondary w-full text-center sm:w-auto">
              {t("login")}
            </Link>
          </div>
        </div>
      </section>

      <section aria-labelledby="landing-features" className="space-y-4">
        <h2 id="landing-features" className="text-xl font-semibold">
          {t("features.title")}
        </h2>
        <div className="grid gap-4 sm:grid-cols-2">
          {FEATURES.map((feature) => (
            <article key={feature} className="card space-y-2">
              <h3 className="text-lg font-semibold">{t(`features.${feature}.title`)}</h3>
              <p className="text-sm text-slate-600">{t(`features.${feature}.body`)}</p>
            </article>
          ))}
        </div>
      </section>

      <section aria-labelledby="landing-steps" className="card space-y-4">
        <h2 id="landing-steps" className="text-xl font-semibold">
          {t("steps.title")}
        </h2>
        <ol className="grid gap-4 sm:grid-cols-3">
          {STEPS.map((step, index) => (
            <li key={step} className="space-y-1">
              <p className="text-xs font-semibold uppercase tracking-[0.16em] text-emerald-700">{index + 1}</p>
              <p className="text-sm text-slate-600">{t(`steps.${step}`)}</p>
            </li>
          ))}
        </ol>
      </section>

      <section className="card flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-lg font-semibold">{t("closing")}</p>
        <Link href="/register" className="btn-primary w-full text-center sm:w-auto">
          {t("register")}
        </Link>
      </section>
    </div>
  );
}
