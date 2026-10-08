import { getTranslations } from "next-intl/server";
import { ContactForm } from "@/components/marketing/contact-form";
import { getOptionalAuthenticatedUserFromCookies } from "@/lib/auth/current-user";
import { type LangPageProps, marketingLocale, marketingMetadataFor } from "@/lib/marketing/page";
import { getTurnstileSiteKey } from "@/lib/security/turnstile";

export const dynamic = "force-dynamic";
export const generateMetadata = marketingMetadataFor("contact");

/** Contatti e supporto su /it/contact e /en/contact (T-1805): per l'utente autenticato l'email è precompilata. */
export default async function ContactPage(props: LangPageProps) {
  const locale = await marketingLocale(props);
  const [t, user] = await Promise.all([getTranslations({ locale, namespace: "contact" }), getOptionalAuthenticatedUserFromCookies()]);

  return (
    <section className="card mx-auto max-w-2xl space-y-4">
      <h1 className="text-3xl font-semibold leading-tight">{t("title")}</h1>
      <p className="text-sm text-slate-600">{t("intro")}</p>
      <ContactForm initialEmail={user?.email ?? ""} turnstileSiteKey={getTurnstileSiteKey()} />
    </section>
  );
}
