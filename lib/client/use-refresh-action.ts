import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { ApiErrorPayload, readApiResponse } from "@/lib/client/http";

type RefreshActionOptions = {
  redirectTo?: string | null;
  /** Dopo il successo il pulsante resta in caricamento finché la pagina aggiornata non lo smonta. */
  keepLoadingOnSuccess?: boolean;
};

/**
 * Azione di un pulsante che chiama un'API e poi aggiorna la pagina (T-1102): stato di caricamento ed
 * errore, redirect facoltativo e router.refresh(). run restituisce il messaggio d'errore oppure null; il messaggio
 * arriva dal catalogo per il code della risposta (T-1303).
 */
export function useRefreshAction() {
  const tErrors = useTranslations("errors");
  const tCommon = useTranslations("common");
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const run = async (request: () => Promise<Response>, options: RefreshActionOptions = {}): Promise<string | null> => {
    setLoading(true);
    setError(null);

    try {
      const response = await request();
      await readApiResponse<ApiErrorPayload>(response, tErrors);

      if (options.redirectTo) {
        router.push(options.redirectTo);
      }

      router.refresh();
      if (!options.keepLoadingOnSuccess) {
        setLoading(false);
      }
      return null;
    } catch (requestError) {
      const message = requestError instanceof Error ? requestError.message : tCommon("unexpectedError");
      setError(message);
      setLoading(false);
      return message;
    }
  };

  return { loading, error, run };
}
