import { ApiErrorPayload, buildApiErrorMessage, readJsonSafe } from "@/lib/client/http";

const RUN_FAILED_MESSAGE = "Estrazione non riuscita";

type RunExtractionPayload = ApiErrorPayload & { data?: { jobId?: string } | null; jobId?: string };

/**
 * Id del job avviato dalla POST di estrazione (T-1204, T-1205): 202 con data.jobId, oppure 409 JOB_ALREADY_ACTIVE
 * con il jobId del job già in corso sulla sezione. Ogni altra risposta lancia un errore con il messaggio da mostrare.
 */
export async function readStartedJobId(response: Response): Promise<string> {
  const payload = await readJsonSafe<RunExtractionPayload>(response);
  if (response.status === 202 && payload?.data?.jobId) {
    return payload.data.jobId;
  }
  if (response.status === 409 && payload?.code === "JOB_ALREADY_ACTIVE" && payload.jobId) {
    return payload.jobId;
  }

  // Nessun job avviato: anche una risposta 2xx diversa da 202 non è un'estrazione partita.
  throw new Error(response.ok ? payload?.error?.trim() || RUN_FAILED_MESSAGE : buildApiErrorMessage(response, payload, RUN_FAILED_MESSAGE));
}
