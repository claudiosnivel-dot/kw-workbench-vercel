import type { AppLocale } from "@/lib/i18n/locale";

/** Template delle email transazionali (T-1402), nei cataloghi sotto emails. */
export type EmailTemplate = "verify-email" | "password-reset" | "account-exists" | "workspace-invite" | "billing-notice";

/** Messaggio pronto per l'invio: id è anche la Idempotency-Key di Resend, quindi un ritentativo non duplica l'email. */
export type EmailMessage = {
  id: string;
  to: string;
  template: EmailTemplate;
  locale: AppLocale;
  subject: string;
  html: string;
  text: string;
};

export interface EmailSender {
  send(message: EmailMessage): Promise<{ providerId: string }>;
}

/** Invio non riuscito dopo l'ultimo tentativo, o messaggio rifiutato prima dell'invio (destinatario o subject non validi). */
export class EmailDeliveryError extends Error {
  readonly template: EmailTemplate;
  readonly messageId: string;

  constructor(message: EmailMessage, reason: string) {
    super(`Invio dell'email ${message.template} (${message.id}) non riuscito: ${reason}`);
    this.name = "EmailDeliveryError";
    this.template = message.template;
    this.messageId = message.id;
  }
}
