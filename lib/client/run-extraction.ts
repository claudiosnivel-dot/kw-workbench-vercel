import { ApiErrorPayload, buildApiErrorMessage, readJsonSafe } from "@/lib/client/http";

const RUN_FAILED_MESSAGE = "Estrazione non riuscita";

type RunExtractionPayload = ApiErrorPayload & { data?: { status?: string } | null };

/** Lancia un errore con il messaggio da mostrare se l'estrazione non è terminata con status completed. */
export async function ensureExtractionCompleted(response: Response): Promise<void> {
  const payload = await readJsonSafe<RunExtractionPayload>(response);
  if (!response.ok) {
    throw new Error(buildApiErrorMessage(response, payload, RUN_FAILED_MESSAGE));
  }

  // Una risposta 200 non basta: conta lo stato reale del job.
  if (payload?.data?.status !== "completed") {
    throw new Error(payload?.error?.trim() || RUN_FAILED_MESSAGE);
  }
}
