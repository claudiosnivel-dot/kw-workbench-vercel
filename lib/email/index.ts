import { randomUUID } from "node:crypto";
import { Resend } from "resend";
import { normalizeEmail } from "@/lib/auth/email-address";
import { OutboxEmailSender, type OutboxStore, databaseOutbox } from "@/lib/email/outbox-sender";
import { ResendEmailSender, unconfiguredResendSender } from "@/lib/email/resend-sender";
import { render as accountExists } from "@/lib/email/templates/account-exists";
import { render as billingNotice } from "@/lib/email/templates/billing-notice";
import type { RenderedEmail } from "@/lib/email/templates/layout";
import { render as passwordReset } from "@/lib/email/templates/password-reset";
import { render as verifyEmail } from "@/lib/email/templates/verify-email";
import { render as workspaceInvite } from "@/lib/email/templates/workspace-invite";
import { EmailDeliveryError, type EmailMessage, type EmailSender, type EmailTemplate } from "@/lib/email/types";
import { getEmailTransport, getResendSettings } from "@/lib/env";
import type { AppLocale } from "@/lib/i18n/locale";

const RENDERERS = {
  "verify-email": verifyEmail,
  "password-reset": passwordReset,
  "account-exists": accountExists,
  "workspace-invite": workspaceInvite,
  "billing-notice": billingNotice,
} satisfies Record<EmailTemplate, (locale: AppLocale, vars: never) => RenderedEmail>;

type TemplateVars = { [K in EmailTemplate]: Parameters<(typeof RENDERERS)[K]>[1] };

/**
 * Mittente scelto da EMAIL_TRANSPORT (T-1402, D-11): Resend, oppure l'outbox (di default la tabella email_outbox). Con
 * resend ma senza RESEND_API_KEY ed EMAIL_FROM (D-11 emendata il 2026-10-07) ogni invio fallisce come non configurato.
 */
export function getEmailSender(outbox: OutboxStore = databaseOutbox): EmailSender {
  if (getEmailTransport() === "outbox") {
    return new OutboxEmailSender(outbox);
  }

  const settings = getResendSettings();
  return settings ? new ResendEmailSender(new Resend(settings.apiKey), settings.from) : unconfiguredResendSender;
}

/**
 * Rende il template nella lingua indicata e lo invia (T-1402). Destinatario e subject con CR o LF sono rifiutati prima
 * dell'invio (CWE-93); un invio non riuscito arriva al chiamante come EmailDeliveryError, già registrato nei log.
 */
export async function sendTemplateEmail<K extends EmailTemplate>(input: {
  to: string;
  template: K;
  locale: AppLocale;
  vars: TemplateVars[K];
}): Promise<{ providerId: string }> {
  const render = RENDERERS[input.template] as (locale: AppLocale, vars: TemplateVars[K]) => RenderedEmail;
  const message: EmailMessage = {
    id: randomUUID(),
    to: input.to,
    template: input.template,
    locale: input.locale,
    ...render(input.locale, input.vars),
  };

  if (normalizeEmail(message.to) !== message.to || /[\r\n]/.test(message.subject)) {
    throw new EmailDeliveryError(message, "destinatario o subject non validi");
  }

  return getEmailSender().send(message);
}
