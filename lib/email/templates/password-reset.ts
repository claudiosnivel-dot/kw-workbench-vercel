import type { AppLocale } from "@/lib/i18n/locale";
import { appLink, composeEmail, emailTranslator, type RenderedEmail } from "@/lib/email/templates/layout";

/** Recupero password (T-1404): link APP_PUBLIC_URL/reset-password?token=..., valido 1 h e monouso. */
export function render(locale: AppLocale, vars: { displayName: string; token: string }): RenderedEmail {
  const t = emailTranslator(locale);
  return composeEmail(locale, {
    subject: t("passwordReset.subject"),
    name: vars.displayName,
    intro: t("passwordReset.intro"),
    action: { label: t("passwordReset.action"), url: appLink("reset-password", { token: vars.token }) },
    notes: [t("passwordReset.expiry")],
  });
}
