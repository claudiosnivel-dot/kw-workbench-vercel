import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { LandingJourney } from "@/components/marketing/landing-journey";
import { LANDING_STEPS, LandingScene } from "@/components/marketing/landing-scenes";
import type { AppLocale } from "@/lib/i18n/locale";
import { marketingPath } from "@/lib/marketing/routes";

const CARDS = ["languages", "team", "volumes", "export"] as const;

/**
 * Pagina principale pubblica (T-1801, T-5801): apertura sul percorso completo, le 6 tappe con la scena dell'app accanto
 * (T-5802) o nella finestra ferma (T-5901), le 4 schede per il resto e la chiusura. Testi dai cataloghi della lingua del percorso, senza affermazioni su
 * clienti, numeri o certificazioni; titoli e articoli sono proposte che l'utente rivede. Solo token del tema (T-5701).
 * Nessun link alle pagine dell'app: solo registrazione, accesso e prezzi.
 */
export async function Landing({ locale }: { locale: AppLocale }) {
  const [t, tScenes] = await Promise.all([
    getTranslations({ locale, namespace: "marketing.landing" }),
    getTranslations({ locale, namespace: "marketing.landing.scenes" }),
  ]);

  return (
    <div className="landing">
      <section className="landing-hero">
        <p className="landing-eyebrow">{t("eyebrow")}</p>
        <h1 className="landing-title">
          {t("title")} <span className="landing-accent">{t("titleAccent")}</span>
        </h1>
        <p className="landing-lead">{t("intro")}</p>
        <div className="landing-actions">
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
      </section>

      <section aria-labelledby="landing-journey" className="landing-section">
        <div className="landing-section-head">
          <p className="landing-eyebrow">{t("journey.eyebrow")}</p>
          <h2 id="landing-journey" className="landing-heading">
            {t("journey.title")}
          </h2>
          <p className="landing-lead">{t("journey.intro")}</p>
        </div>
        <LandingJourney
          steps={LANDING_STEPS.map((step, index) => ({
            id: step,
            text: (
              <>
                <p className="landing-step-number" aria-hidden="true">
                  {String(index + 1).padStart(2, "0")}
                </p>
                <h3 className="landing-step-title">{t(`journey.steps.${step}.title`)}</h3>
                <p className="landing-step-body">{t(`journey.steps.${step}.body`)}</p>
              </>
            ),
            scene: <LandingScene step={step} t={tScenes} />,
          }))}
        />
      </section>

      <section aria-labelledby="landing-more" className="landing-section">
        <div className="landing-section-head">
          <h2 id="landing-more" className="landing-heading">
            {t("more.title")}
          </h2>
        </div>
        <div className="landing-cards">
          {CARDS.map((card) => (
            <article key={card} className="landing-card">
              <h3 className="landing-card-title">{t(`more.cards.${card}.title`)}</h3>
              <p className="landing-card-body">{t(`more.cards.${card}.body`)}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="landing-closing">
        <p className="landing-closing-text">{t("closing")}</p>
        <Link href="/register" className="btn-primary w-full text-center sm:w-auto">
          {t("register")}
        </Link>
      </section>
    </div>
  );
}
