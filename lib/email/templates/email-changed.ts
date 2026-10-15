import type { AppLocale } from "@/lib/i18n/locale";
import { composeEmail, emailTranslator, type RenderedEmail } from "@/lib/email/templates/layout";

/**
 * Avviso al vecchio indirizzo dopo un cambio dell'email (T-3001): nessun link e nessun nuovo indirizzo, così chi legge
 * la vecchia casella non scopre dove è finito l'account e non ha un link da seguire.
 */
export function render(locale: AppLocale, vars: { displayName: string }): RenderedEmail {
  const t = emailTranslator(locale);
  return composeEmail(locale, {
    subject: t("emailChanged.subject"),
    name: vars.displayName,
    intro: t("emailChanged.intro"),
    notes: [t("emailChanged.notYou")],
    footer: t("emailChanged.footer"),
  });
}
