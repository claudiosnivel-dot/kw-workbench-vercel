import { useTranslations } from "next-intl";
import { useEffect, useRef, useState } from "react";
import { buildApiErrorMessage, readJsonSafe, type ApiErrorPayload } from "@/lib/client/http";

export type JobStatus = "pending" | "running" | "completed" | "failed" | "canceled";
export type JobPhase = "expand" | "autocomplete" | "metrics" | "store" | "done";

export type JobSnapshot = {
  status: JobStatus;
  phase: JobPhase;
  progress: { done: number; total: number };
  error: string | null;
  /** Ultime keyword trovate, solo mentre il job è attivo (T-2404). */
  recentSuggestions?: string[];
};

const POLL_INTERVAL_MS = 2_000;
const MAX_POLL_INTERVAL_MS = 16_000;
const TERMINAL_STATUSES = new Set<JobStatus>(["completed", "failed", "canceled"]);

export function isJobActive(status: JobStatus): boolean {
  return !TERMINAL_STATUSES.has(status);
}

/**
 * Stato di un job di estrazione letto con il polling di GET /api/jobs/{jobId} (T-1205): ogni 2 s; a ogni errore
 * consecutivo (rete o 5xx) l'intervallo raddoppia fino a 16 s e torna a 2 s al primo successo; un 4xx ferma il polling
 * con il messaggio del catalogo. Il polling si ferma a job terminato e allo smontaggio; onCompleted arriva a completed.
 * cancel chiede l'annullamento (T-1204) e, se il job è già annullato, lo mostra subito.
 */
export function useJobStatus(jobId: string, onCompleted?: () => void) {
  const tErrors = useTranslations("errors");
  const [job, setJob] = useState<JobSnapshot>({ status: "pending", phase: "expand", progress: { done: 0, total: 0 }, error: null });
  const [pollError, setPollError] = useState<string | null>(null);
  const [canceling, setCanceling] = useState(false);
  const onCompletedRef = useRef(onCompleted);

  useEffect(() => {
    onCompletedRef.current = onCompleted;
  }, [onCompleted]);

  useEffect(() => {
    const controller = new AbortController();
    let timer: number | undefined;
    let delay = POLL_INTERVAL_MS;

    const schedule = () => {
      timer = window.setTimeout(poll, delay);
    };

    async function poll() {
      let response: Response;
      try {
        response = await fetch(`/api/jobs/${encodeURIComponent(jobId)}`, { cache: "no-store", signal: controller.signal });
      } catch {
        if (controller.signal.aborted) return;
        delay = Math.min(delay * 2, MAX_POLL_INTERVAL_MS);
        schedule();
        return;
      }
      if (controller.signal.aborted) return;

      if (response.status >= 500) {
        delay = Math.min(delay * 2, MAX_POLL_INTERVAL_MS);
        schedule();
        return;
      }

      const payload = await readJsonSafe<ApiErrorPayload & { data?: JobSnapshot }>(response);
      if (controller.signal.aborted) return;
      if (!response.ok || !payload?.data) {
        // 4xx (sessione scaduta, job non trovato): nessun nuovo tentativo, solo il messaggio.
        setPollError(buildApiErrorMessage(response, payload, tErrors));
        return;
      }

      const snapshot = payload.data;
      setPollError(null);
      setJob(snapshot);
      if (!isJobActive(snapshot.status)) {
        if (snapshot.status === "completed") {
          onCompletedRef.current?.();
        }
        return;
      }
      delay = POLL_INTERVAL_MS;
      schedule();
    }

    schedule();
    return () => {
      controller.abort();
      window.clearTimeout(timer);
    };
  }, [jobId, tErrors]);

  const cancel = async () => {
    setCanceling(true);
    try {
      const response = await fetch(`/api/jobs/${encodeURIComponent(jobId)}/cancel`, { method: "POST" });
      const payload = await readJsonSafe<{ data?: { status?: JobStatus } }>(response);
      if (response.ok && payload?.data?.status === "canceled") {
        setJob((current) => ({ ...current, status: "canceled" }));
      }
    } catch {
      setCanceling(false);
    }
  };

  return { job, pollError, canceling, cancel };
}
