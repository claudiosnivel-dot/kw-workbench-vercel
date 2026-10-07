import type { AppLocale } from "@/lib/i18n/locale";
import { appLink, composeEmail, emailTranslator, type RenderedEmail } from "@/lib/email/templates/layout";

/**
 * Avviso di billing (T-1604): contenuto segnaposto con le sole variabili piano e data finché D-14 non fissa piani e
 * periodi; nessun testo legale definitivo (D-15).
 */
export function render(locale: AppLocale, vars: { displayName: string; plan: string; date: string }): RenderedEmail {
  const t = emailTranslator(locale);
  return composeEmail(locale, {
    subject: t("billingNotice.subject"),
    name: vars.displayName,
    intro: t("billingNotice.intro", { plan: vars.plan, date: vars.date }),
    action: { label: t("billingNotice.action"), url: appLink("") },
  });
}
