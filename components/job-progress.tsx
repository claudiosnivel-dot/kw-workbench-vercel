"use client";

import Link from "next/link";
import { useTranslations } from "next-intl";
import { useEffect, useRef, useState } from "react";
import { buildApiErrorMessage, readJsonSafe, type ApiErrorPayload } from "@/lib/client/http";

type JobStatus = "pending" | "running" | "completed" | "failed" | "canceled";
type JobPhase = "expand" | "autocomplete" | "metrics" | "store" | "done";

type JobSnapshot = {
  status: JobStatus;
  phase: JobPhase;
  progress: { done: number; total: number };
  error: string | null;
};

type JobProgressProps = {
  jobId: string;
  resultsHref: string;
  onCompleted?: () => void;
};

const POLL_INTERVAL_MS = 2_000;
const MAX_POLL_INTERVAL_MS = 16_000;
const TERMINAL_STATUSES = new Set<JobStatus>(["completed", "failed", "canceled"]);

/**
 * Avanzamento di un job di estrazione (T-1205): polling di GET /api/jobs/{jobId} ogni 2 s; a ogni errore consecutivo
 * (rete o 5xx) l'intervallo raddoppia fino a 16 s e torna a 2 s al primo successo. Il polling si ferma a job
 * terminato e allo smontaggio. Il messaggio d'errore del job è reso come testo (CWE-79).
 */
export function JobProgress({ jobId, resultsHref, onCompleted }: JobProgressProps) {
  const t = useTranslations("jobs");
  const tErrors = useTranslations("errors");
  const [job, setJob] = useState<JobSnapshot>({ status: "pending", phase: "expand", progress: { done: 0, total: 0 }, error: null });
  const [pollError, setPollError] = useState<string | null>(null);
  const [canceling, setCanceling] = useState(false);
  const barRef = useRef<HTMLDivElement>(null);
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
      if (TERMINAL_STATUSES.has(snapshot.status)) {
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

  const { done, total } = job.progress;
  const percent = total > 0 ? Math.min(100, Math.round((done / total) * 100)) : 0;

  // Larghezza impostata dal DOM e non con l'attributo style: la CSP non ammette stili inline (T-505).
  useEffect(() => {
    if (barRef.current) {
      barRef.current.style.width = `${percent}%`;
    }
  }, [percent]);

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

  const active = !TERMINAL_STATUSES.has(job.status);

  return (
    <div className="w-full space-y-2" aria-live="polite">
      <div
        role="progressbar"
        aria-label={t("progress.ariaLabel")}
        aria-valuemin={0}
        aria-valuenow={done}
        aria-valuemax={total}
        className="h-2 w-full overflow-hidden rounded-full bg-[var(--surface-muted)]"
      >
        <div ref={barRef} className="h-full w-0 bg-[var(--brand-500)] transition-[width]" />
      </div>
      <p className="flex flex-wrap gap-2 text-sm text-slate-600">
        <span>{t(`progress.phase.${job.phase}`)}</span>
        <span>
          {done} / {total}
        </span>
      </p>
      {job.status === "completed" && (
        <Link className="btn-secondary inline-block w-full text-center sm:w-auto" href={resultsHref}>
          {t("progress.viewResults")}
        </Link>
      )}
      {job.status === "failed" && <p className="text-sm text-red-700">{job.error?.trim() || t("run.failed")}</p>}
      {job.status === "canceled" && <p className="text-sm text-slate-600">{t("progress.canceled")}</p>}
      {pollError && <p className="text-sm text-red-700">{pollError}</p>}
      {active && (
        <button type="button" className="btn-secondary w-full sm:w-auto" onClick={cancel} disabled={canceling}>
          {canceling ? t("progress.canceling") : t("progress.cancel")}
        </button>
      )}
    </div>
  );
}
