import { useTranslations } from "next-intl";
import { useState } from "react";
import { readApiData } from "@/lib/client/http";

/**
 * Dati { data } di una richiesta API con stato di caricamento ed errore dal catalogo (T-1303), come per l'export e
 * l'import di Keyword Planner. load restituisce true quando i dati sono arrivati.
 */
export function useApiData<T>() {
  const tErrors = useTranslations("errors");
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const load = async (request: () => Promise<Response>): Promise<boolean> => {
    setLoading(true);
    setError(null);
    const result = await readApiData<T>(await request(), tErrors);
    setLoading(false);
    if ("error" in result) {
      setError(result.error);
      return false;
    }
    setData(result.data);
    return true;
  };

  return { data, error, setError, loading, load };
}
