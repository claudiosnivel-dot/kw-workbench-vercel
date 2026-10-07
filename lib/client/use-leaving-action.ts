import { useTranslations } from "next-intl";
import { useState } from "react";
import { type ErrorTranslator, messageOf } from "@/lib/client/http";

/**
 * Azione che si conclude aprendo un'altra pagina: accesso, registrazione e passi del percorso guidato (T-1303). Resta
 * in corso fino al cambio di pagina; un errore mostra il messaggio (dal catalogo per le risposte API) e la riabilita.
 * key distingue più pulsanti dello stesso componente.
 */
export function useLeavingAction<K extends string = "default">() {
  const tErrors = useTranslations("errors");
  const tCommon = useTranslations("common");
  const [pending, setPending] = useState<K | null>(null);
  const [error, setError] = useState<string | null>(null);

  const run = async (action: (tErrors: ErrorTranslator) => Promise<void>, key = "default" as K) => {
    setPending(key);
    setError(null);
    try {
      await action(tErrors);
    } catch (actionError) {
      setError(messageOf(actionError, tCommon("unexpectedError")));
      setPending(null);
    }
  };

  return { pending, error, setError, run };
}
