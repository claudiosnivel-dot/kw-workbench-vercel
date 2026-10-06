import { useRouter } from "next/navigation";
import { useState } from "react";
import { ApiErrorPayload, buildApiErrorMessage, readJsonSafe } from "@/lib/client/http";

type RefreshActionOptions = {
  /** Messaggio quando la risposta non è ok e l'API non ne dà uno. */
  failureMessage: string;
  redirectTo?: string | null;
  /** Dopo il successo il pulsante resta in caricamento finché la pagina aggiornata non lo smonta. */
  keepLoadingOnSuccess?: boolean;
};

/**
 * Azione di un pulsante che chiama un'API e poi aggiorna la pagina (T-1102): stato di caricamento ed
 * errore, redirect facoltativo e router.refresh(). run restituisce il messaggio d'errore oppure null.
 */
export function useRefreshAction() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const run = async (request: () => Promise<Response>, options: RefreshActionOptions): Promise<string | null> => {
    setLoading(true);
    setError(null);

    try {
      const response = await request();
      const payload = await readJsonSafe<ApiErrorPayload>(response);
      if (!response.ok) {
        throw new Error(buildApiErrorMessage(response, payload, options.failureMessage));
      }

      if (options.redirectTo) {
        router.push(options.redirectTo);
      }

      router.refresh();
      if (!options.keepLoadingOnSuccess) {
        setLoading(false);
      }
      return null;
    } catch (requestError) {
      const message = requestError instanceof Error ? requestError.message : "Errore imprevisto";
      setError(message);
      setLoading(false);
      return message;
    }
  };

  return { loading, error, run };
}
