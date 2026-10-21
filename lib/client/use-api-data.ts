import { useTranslations } from "next-intl";
import { useState } from "react";
import { readApiData } from "@/lib/client/http";

/**
 * Dati { data } di una richiesta API con stato di caricamento ed errore dal catalogo (T-1303), come per l'export e
 * l'import di Keyword Planner. load restituisce true quando i dati sono arrivati; una richiesta che non parte (rete)
 * è l'errore generico. clear toglie dati ed errore della richiesta precedente (T-4601).
 */
export function useApiData<T>() {
  const tErrors = useTranslations("errors");
  const tCommon = useTranslations("common");
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const load = async (request: () => Promise<Response>): Promise<boolean> => {
    setLoading(true);
    setError(null);
    const result = await request().then(
      (response) => readApiData<T>(response, tErrors),
      () => ({ error: tCommon("unexpectedError") })
    );
    setLoading(false);
    if ("error" in result) {
      setError(result.error);
      return false;
    }
    setData(result.data);
    return true;
  };

  const clear = () => {
    setData(null);
    setError(null);
  };

  return { data, error, setError, loading, load, clear };
}
