import { useTranslations } from "next-intl";
import { ApiErrorPayload, buildApiErrorMessage, type ErrorTranslator, readJsonSafe } from "@/lib/client/http";
import { isApiErrorCode } from "@/lib/http/error-codes";

type RunExtractionPayload = ApiErrorPayload & { data?: { jobId?: string } | null; jobId?: string };

/**
 * Id del job avviato dalla POST di estrazione (T-1204, T-1205): 202 con data.jobId, oppure 409 JOB_ALREADY_ACTIVE
 * con il jobId del job già in corso sulla sezione. Ogni altra risposta lancia un errore con il messaggio da mostrare:
 * il testo del catalogo per un code noto (T-1303), altrimenti «Estrazione non riuscita» (failedMessage, AC-305-3).
 */
export async function readStartedJobId(
  response: Response,
  messages: { errors: ErrorTranslator; failedMessage: string }
): Promise<string> {
  const payload = await readJsonSafe<RunExtractionPayload>(response);
  if (response.status === 202 && payload?.data?.jobId) {
    return payload.data.jobId;
  }
  if (response.status === 409 && payload?.code === "JOB_ALREADY_ACTIVE" && payload.jobId) {
    return payload.jobId;
  }

  // Nessun job avviato: anche una risposta 2xx diversa da 202 non è un'estrazione partita.
  throw new Error(
    !response.ok && isApiErrorCode(payload?.code)
      ? buildApiErrorMessage(response, payload, messages.errors)
      : messages.failedMessage
  );
}

/**
 * Avvio della ricerca di un argomento con la sua rotta run (prossimo passo T-2302, «Aggiungi i volumi» T-2405): la
 * funzione restituisce l'id del job o lancia un errore con il messaggio del catalogo.
 */
export function useTopicSearch(): (projectId: string, topicId: string) => Promise<string> {
  const tErrors = useTranslations("errors");
  const tJobs = useTranslations("jobs.run");
  return async (projectId, topicId) => {
    const response = await fetch(`/api/projects/${projectId}/subprojects/${topicId}/run`, { method: "POST" });
    return readStartedJobId(response, { errors: tErrors, failedMessage: tJobs("failed") });
  };
}
