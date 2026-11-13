import { useTranslations } from "next-intl";
import { useEffect, useRef, useState } from "react";
import { type ApiErrorPayload, buildApiErrorMessage, type ErrorTranslator, readJsonSafe, sendJson } from "@/lib/client/http";
import { isPlanRunActive, type PlanRunView } from "@/lib/modules/plan-runs/types";

/*
 * Lavoro di piano dal browser (T-6201, T-6202): avvio con la POST /strategies e lettura dello stato finché il lavoro
 * non finisce, come la ricerca delle keyword (T-1205).
 */

type StartPayload = ApiErrorPayload & { data?: { runId?: string } | null; runId?: string };

/**
 * Avvia il lavoro di piano e ne restituisce l'id: 202 con data.runId, oppure 409 JOB_ALREADY_ACTIVE con il runId del
 * lavoro già attivo nel progetto, che si segue al suo posto. Ogni altra risposta lancia un errore con il testo del
 * catalogo (T-1303).
 */
export async function startPlanRun(projectId: string, body: unknown, errors: ErrorTranslator): Promise<string> {
  const response = await sendJson("POST", `/api/projects/${encodeURIComponent(projectId)}/strategies`, body);
  const payload = await readJsonSafe<StartPayload>(response);
  const started = response.status === 202 ? payload?.data?.runId : null;
  const active = response.status === 409 && payload?.code === "JOB_ALREADY_ACTIVE" ? payload.runId : null;
  const runId = started ?? active;
  if (runId) return runId;
  throw new Error(buildApiErrorMessage(response, payload, errors));
}

const FIRST_WAIT_MS = 0;
const NEXT_WAIT_MS = 2_000;
const LONGEST_WAIT_MS = 16_000;

/** Attesa che finisce prima se il componente si smonta. */
function pause(ms: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve) => {
    const timer = window.setTimeout(resolve, ms);
    const stop = () => {
      window.clearTimeout(timer);
      resolve();
    };
    signal.addEventListener("abort", stop, { once: true });
  });
}

type Reading = { run: PlanRunView } | { retry: true } | { message: string };

async function readRun(url: string, signal: AbortSignal, errors: ErrorTranslator): Promise<Reading> {
  try {
    const response = await fetch(url, { cache: "no-store", signal });
    if (response.status >= 500) return { retry: true };
    const payload = await readJsonSafe<ApiErrorPayload & { data?: PlanRunView }>(response);
    return response.ok && payload?.data ? { run: payload.data } : { message: buildApiErrorMessage(response, payload, errors) };
  } catch {
    return { retry: true };
  }
}

/**
 * Stato del lavoro letto da GET /api/projects/{id}/plan-runs/{runId} (T-6202): subito, poi ogni 2 s finché il lavoro è
 * attivo; dopo un errore di rete o un 5xx l'attesa raddoppia fino a 16 s, un 4xx ferma la lettura con il messaggio del
 * catalogo. onFinished riceve il lavoro terminato (completed, failed o canceled).
 */
export function usePlanRunStatus(projectId: string, runId: string, onFinished: (run: PlanRunView) => void) {
  const errors = useTranslations("errors");
  const [run, setRun] = useState<PlanRunView | null>(null);
  const [readError, setReadError] = useState<string | null>(null);
  const finished = useRef(onFinished);

  useEffect(() => {
    finished.current = onFinished;
  }, [onFinished]);

  useEffect(() => {
    const controller = new AbortController();
    const { signal } = controller;
    const url = `/api/projects/${encodeURIComponent(projectId)}/plan-runs/${encodeURIComponent(runId)}`;
    const follow = async () => {
      for (let wait = FIRST_WAIT_MS; ; ) {
        await pause(wait, signal);
        if (signal.aborted) return;
        const reading = await readRun(url, signal, errors);
        if (signal.aborted) return;
        if ("retry" in reading) {
          wait = Math.min(Math.max(wait, NEXT_WAIT_MS) * 2, LONGEST_WAIT_MS);
          continue;
        }
        if ("message" in reading) {
          setReadError(reading.message);
          return;
        }
        setReadError(null);
        setRun(reading.run);
        if (!isPlanRunActive(reading.run.status)) {
          finished.current(reading.run);
          return;
        }
        wait = NEXT_WAIT_MS;
      }
    };
    void follow();
    return () => controller.abort();
  }, [projectId, runId, errors]);

  return { run, readError };
}
