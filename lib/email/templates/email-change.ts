import type { AppLocale } from "@/lib/i18n/locale";
import { appLink, composeEmail, emailTranslator, type RenderedEmail } from "@/lib/email/templates/layout";

/** Conferma del nuovo indirizzo (T-3001): link APP_PUBLIC_URL/email-change?token=..., valido 24 h e monouso. */
export function render(locale: AppLocale, vars: { displayName: string; token: string }): RenderedEmail {
  const t = emailTranslator(locale);
  return composeEmail(locale, {
    subject: t("emailChange.subject"),
    name: vars.displayName,
    intro: t("emailChange.intro"),
    action: { label: t("emailChange.action"), url: appLink("email-change", { token: vars.token }) },
    notes: [t("emailChange.expiry")],
  });
}
