import { useTranslations } from "next-intl";
import { useState } from "react";
import { type ErrorTranslator, messageOf } from "@/lib/client/http";

/**
 * Salvataggio di una card delle impostazioni (T-1303): in corso, errore (dal catalogo per le risposte API) e conferma.
 * action restituisce il messaggio di conferma da mostrare.
 */
export function useSaveAction() {
  const tErrors = useTranslations("errors");
  const tCommon = useTranslations("common");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const save = async (action: (tErrors: ErrorTranslator) => Promise<string>) => {
    setSaving(true);
    setError(null);
    setSuccess(null);
    try {
      setSuccess(await action(tErrors));
    } catch (saveError) {
      setError(messageOf(saveError, tCommon("unexpectedError")));
    } finally {
      setSaving(false);
    }
  };

  return { saving, error, success, setError, setSuccess, save };
}
