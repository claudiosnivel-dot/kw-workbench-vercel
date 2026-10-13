import { useTranslations } from "next-intl";
import { useState } from "react";
import { messageOf } from "@/lib/client/http";

/**
 * Azione di un pulsante che chiama le API e poi cambia pagina o la aggiorna (prossimo passo T-2302, «Aggiungi i volumi»
 * T-2405): pending dall'avvio, errore con il messaggio dell'Error (già tradotto per le risposte API) e pulsante di nuovo
 * attivo; dopo il successo pending resta vero finché la pagina nuova non smonta il pulsante.
 */
export function usePendingAction() {
  const tCommon = useTranslations("common");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const run = async (action: () => Promise<void>) => {
    setPending(true);
    setError(null);
    try {
      await action();
    } catch (actionError) {
      setError(messageOf(actionError, tCommon("unexpectedError")));
      setPending(false);
    }
  };

  return { pending, error, run };
}
