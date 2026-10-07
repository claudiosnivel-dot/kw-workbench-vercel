import type { AppLocale } from "@/lib/i18n/locale";
import { appLink, composeEmail, emailTranslator, type RenderedEmail } from "@/lib/email/templates/layout";

/**
 * Registrazione con un'email che ha già un account (T-1403): la risposta della registrazione è identica a quella di
 * un'email nuova, il titolare reale riceve questo avviso con i link a login e recupero password.
 */
export function render(locale: AppLocale, vars: { displayName: string }): RenderedEmail {
  const t = emailTranslator(locale);
  return composeEmail(locale, {
    subject: t("accountExists.subject"),
    name: vars.displayName,
    intro: t("accountExists.intro"),
    action: { label: t("accountExists.action"), url: appLink("login") },
    notes: [`${t("accountExists.reset")} ${appLink("forgot-password")}`],
  });
}
