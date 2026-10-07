import { after } from "next/server";
import { EmailDeliveryError } from "@/lib/email/types";
import { logger } from "@/lib/observability/logger";

/**
 * Lavoro eseguito dopo l'invio della risposta (T-1403, T-1404): ricerca dell'account, token e invio delle email
 * restano fuori dal tempo di risposta, che così non rivela se un'email ha un account (CWE-208). Un errore non cambia
 * la risposta già inviata: finisce nei log con event, senza indirizzi né token (l'EmailDeliveryError è già registrato
 * dal mittente).
 */
export function runAfterResponse(event: string, task: () => Promise<void>): void {
  after(async () => {
    try {
      await task();
    } catch (error) {
      if (!(error instanceof EmailDeliveryError)) {
        logger.error(event, { error });
      }
    }
  });
}
