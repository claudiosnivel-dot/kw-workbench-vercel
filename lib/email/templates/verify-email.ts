import type { AppLocale } from "@/lib/i18n/locale";
import { appLink, composeEmail, emailTranslator, type RenderedEmail } from "@/lib/email/templates/layout";

/** Verifica dell'email alla registrazione (T-1403): link APP_PUBLIC_URL/verify-email?token=..., valido 24 h. */
export function render(locale: AppLocale, vars: { displayName: string; token: string }): RenderedEmail {
  const t = emailTranslator(locale);
  return composeEmail(locale, {
    subject: t("verify.subject"),
    name: vars.displayName,
    intro: t("verify.intro"),
    action: { label: t("verify.action"), url: appLink("verify-email", { token: vars.token }) },
    notes: [t("verify.expiry")],
  });
}
