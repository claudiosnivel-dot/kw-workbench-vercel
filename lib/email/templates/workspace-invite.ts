import type { AppLocale } from "@/lib/i18n/locale";
import { appLink, composeEmail, emailTranslator, type RenderedEmail } from "@/lib/email/templates/layout";

/** Link dell'invito APP_PUBLIC_URL/invites/accept?token=...: lo stesso nell'email e nella risposta a chi invita (T-3201). */
export function inviteLink(token: string): string {
  return appLink("invites/accept", { token });
}

/** Invito in un workspace (T-1503, nella lingua di chi invita) con il link dell'invito. */
export function render(
  locale: AppLocale,
  vars: { inviteeName: string; inviterName: string; workspaceName: string; token: string }
): RenderedEmail {
  const t = emailTranslator(locale);
  const names = { inviter: vars.inviterName, workspace: vars.workspaceName };
  return composeEmail(locale, {
    subject: t("workspaceInvite.subject", names),
    name: vars.inviteeName,
    intro: t("workspaceInvite.intro", names),
    action: { label: t("workspaceInvite.action"), url: inviteLink(vars.token) },
    notes: [t("workspaceInvite.expiry")],
  });
}
