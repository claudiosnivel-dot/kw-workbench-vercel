import type { AppLocale } from "@/lib/i18n/locale";
import { appLink, composeEmail, emailTranslator, type RenderedEmail } from "@/lib/email/templates/layout";

/**
 * Avviso di password reimpostata da un amministratore (T-1704): le sessioni sono revocate e al prossimo accesso va
 * scelta una nuova password; nessuna password nell'email.
 */
export function render(locale: AppLocale, vars: { displayName: string }): RenderedEmail {
  const t = emailTranslator(locale);
  return composeEmail(locale, {
    subject: t("adminPasswordReset.subject"),
    name: vars.displayName,
    intro: t("adminPasswordReset.intro"),
    action: { label: t("adminPasswordReset.action"), url: appLink("login") },
    notes: [t("adminPasswordReset.notYou")],
  });
}
