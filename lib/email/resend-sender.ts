import type { Resend } from "resend";
import { emailDomain } from "@/lib/auth/email-address";
import { EmailDeliveryError, type EmailMessage, type EmailSender } from "@/lib/email/types";

/** Il solo metodo del client di Resend usato qui: nei test si sostituisce con un mock. */
export type ResendEmailsClient = { emails: Pick<Resend["emails"], "send"> };

// 2 ritentativi al massimo (3 tentativi totali) con attesa crescente: 500 ms, poi 1 s.
const MAX_ATTEMPTS = 3;
const BASE_DELAY_MS = 500;

type Attempt = { providerId: string } | { retryable: boolean; reason: string };

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Fallimento definitivo di un invio: un solo console.error con template, id e dominio del destinatario, mai l'indirizzo
 * completo, la chiave API, il corpo o i link (CWE-532); l'EmailDeliveryError da lanciare al chiamante.
 */
function deliveryFailure(message: EmailMessage, attempts: number, reason: string): EmailDeliveryError {
  console.error(
    JSON.stringify({
      level: "error",
      msg: "email_delivery_failed",
      template: message.template,
      messageId: message.id,
      recipientDomain: emailDomain(message.to),
      attempts,
      reason,
    })
  );
  return new EmailDeliveryError(message, reason);
}

/**
 * Resend senza RESEND_API_KEY ed EMAIL_FROM (D-11 emendata il 2026-10-07: Resend si configura alla fine del blueprint):
 * ogni invio fallisce subito, nessuna richiesta di rete, registrato come gli altri fallimenti.
 */
export const unconfiguredResendSender: EmailSender = {
  async send(message) {
    throw deliveryFailure(message, 0, "resend non configurato");
  },
};

/** Errore di rete (statusCode null), 429 o 5xx: si ritenta; ogni altro 4xx è un errore di validazione definitivo. */
function isRetryableStatus(statusCode: number | null): boolean {
  return statusCode === null || statusCode === 429 || statusCode >= 500;
}

/**
 * Invio con Resend (T-1402, D-11): mittente EMAIL_FROM, Idempotency-Key uguale all'id del messaggio a ogni tentativo.
 * Dopo l'ultimo fallimento un solo console.error (deliveryFailure).
 */
export class ResendEmailSender implements EmailSender {
  constructor(
    private readonly client: ResendEmailsClient,
    private readonly from: string,
    private readonly sleep: (ms: number) => Promise<void> = wait
  ) {}

  async send(message: EmailMessage): Promise<{ providerId: string }> {
    for (let attempt = 1; ; attempt += 1) {
      const outcome = await this.attempt(message);
      if ("providerId" in outcome) {
        return outcome;
      }

      if (!outcome.retryable || attempt === MAX_ATTEMPTS) {
        throw deliveryFailure(message, attempt, outcome.reason);
      }

      await this.sleep(BASE_DELAY_MS * 2 ** (attempt - 1));
    }
  }

  private async attempt(message: EmailMessage): Promise<Attempt> {
    try {
      const { data, error } = await this.client.emails.send(
        {
          from: this.from,
          to: message.to,
          subject: message.subject,
          html: message.html,
          text: message.text,
          ...(message.replyTo ? { replyTo: message.replyTo } : {}),
          tags: [{ name: "template", value: message.template.replace(/-/g, "_") }],
        },
        { idempotencyKey: message.id }
      );

      if (data) {
        return { providerId: data.id };
      }
      return { retryable: isRetryableStatus(error.statusCode), reason: `${error.name} (${error.statusCode ?? "rete"})` };
    } catch {
      // Il client non dovrebbe lanciare (gli errori arrivano in error): un'eccezione si tratta come errore di rete.
      return { retryable: true, reason: "eccezione del client" };
    }
  }
}
