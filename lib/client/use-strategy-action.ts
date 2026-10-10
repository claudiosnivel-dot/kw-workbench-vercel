import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { type ApiErrorPayload, buildApiErrorMessage, messageOf, readJsonSafe, sendJson } from "@/lib/client/http";

/**
 * Modifica del piano di una strategia (T-1905): dopo il successo la pagina si ricarica con la nuova version; dopo un
 * 409 STRATEGY_CONFLICT il messaggio resta e il piano si ricarica comunque, così la modifica successiva parte dalla
 * version corrente. run restituisce true se la modifica è riuscita.
 */
function useStrategyAction() {
  const tErrors = useTranslations("errors");
  const tCommon = useTranslations("common");
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const run = async (request: () => Promise<Response>): Promise<boolean> => {
    setPending(true);
    setError(null);
    try {
      const response = await request();
      if (response.ok) {
        router.refresh();
        return true;
      }
      const payload = await readJsonSafe<ApiErrorPayload>(response);
      setError(buildApiErrorMessage(response, payload, tErrors));
      if (payload?.code === "STRATEGY_CONFLICT") {
        router.refresh();
      }
      return false;
    } catch (requestError) {
      setError(messageOf(requestError, tCommon("unexpectedError")));
      return false;
    } finally {
      setPending(false);
    }
  };

  return { pending, error, run };
}

/**
 * Modifiche al piano della strategia con la version letta dalla pagina (T-1904, T-1905): operazioni di struttura e
 * modifica dei titoli di una pagina.
 */
export function useStrategyOperations(projectId: string, strategyId: string, version: number) {
  const { pending, error, run } = useStrategyAction();
  const base = `/api/projects/${projectId}/strategies/${strategyId}`;
  return {
    pending,
    error,
    operate: (operation: Record<string, unknown> & { type: string }) =>
      run(() => sendJson("POST", `${base}/operations`, { version, operation })),
    patchPage: (pageId: string, patch: Record<string, unknown>) =>
      run(() => sendJson("PATCH", `${base}/pages/${pageId}`, { version, ...patch })),
  };
}
