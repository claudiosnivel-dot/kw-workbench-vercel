import type { EmailMessage, EmailSender } from "@/lib/email/types";

/** Dove l'outbox conserva i messaggi: in memoria nei test unitari, nella tabella email_outbox altrove. */
export type OutboxStore = { save(message: EmailMessage): Promise<void> };

/** Outbox in memoria (test unitari): i messaggi restano nell'array, nessuna rete e nessun DB. */
export function memoryOutbox(): OutboxStore & { messages: EmailMessage[] } {
  const messages: EmailMessage[] = [];
  return {
    messages,
    async save(message) {
      messages.push(message);
    },
  };
}

/** Outbox nella tabella email_outbox (sviluppo e test d'integrazione): il client Prisma si carica solo qui. */
export const databaseOutbox: OutboxStore = {
  async save(message) {
    const { prisma } = await import("@/lib/prisma");
    await prisma.emailOutbox.create({
      data: {
        id: message.id,
        to_address: message.to,
        template: message.template,
        locale: message.locale,
        subject: message.subject,
        html: message.html,
        text: message.text,
        reply_to: message.replyTo ?? null,
      },
    });
  },
};

/** Trasporto senza rete (T-1402): ogni messaggio finisce nell'outbox invece che a un fornitore. */
export class OutboxEmailSender implements EmailSender {
  constructor(private readonly store: OutboxStore) {}

  async send(message: EmailMessage): Promise<{ providerId: string }> {
    await this.store.save(message);
    return { providerId: `outbox-${message.id}` };
  }
}
