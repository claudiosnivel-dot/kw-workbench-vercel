"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { GoogleSheetsExportButton } from "@/components/google-sheets-export-button";
import { readJsonSafe, type ApiErrorPayload } from "@/lib/client/http";
import { pauseOnboardingAndOpenDashboard } from "@/lib/client/onboarding";
import type { ExportFormat, ExportScope } from "@/lib/modules/export-types";

type OnboardingReviewExportStepProps = {
  projectId: string;
  subprojectId: string;
  projectName: string;
  subprojectName: string;
  projectKeywordCount: number;
  sectionKeywordCount: number;
  googleSheetsConnected: boolean;
};

function fileNameFromDisposition(disposition: string | null): string {
  if (!disposition) {
    return `export-${Date.now()}.csv`;
  }

  const match = disposition.match(/filename="([^"]+)"/i);
  return match?.[1] ?? `export-${Date.now()}.csv`;
}

export function OnboardingReviewExportStep({
  projectId,
  subprojectId,
  projectName,
  subprojectName,
  projectKeywordCount,
  sectionKeywordCount,
  googleSheetsConnected,
}: OnboardingReviewExportStepProps) {
  const [loading, setLoading] = useState<ExportFormat | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [leaving, setLeaving] = useState(false);

  const defaultSheetsFileName = useMemo(() => {
    const date = new Date().toISOString().slice(0, 10);
    return `${projectName} - ${subprojectName} keyword export ${date}`;
  }, [projectName, subprojectName]);

  const downloadExport = async (format: ExportFormat, scope: ExportScope) => {
    setLoading(format);
    setError(null);
    setMessage(null);

    try {
      const params = new URLSearchParams({
        format,
        scope,
        subprojectId,
      });

      const response = await fetch(`/api/projects/${projectId}/export?${params.toString()}`);
      if (!response.ok) {
        const payload = await readJsonSafe<ApiErrorPayload>(response);
        throw new Error(payload?.error || "Export non riuscito.");
      }

      const blob = await response.blob();
      const filename = fileNameFromDisposition(response.headers.get("content-disposition"));
      const blobUrl = window.URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = blobUrl;
      link.download = filename;
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(blobUrl);

      const stateResponse = await fetch("/api/onboarding/state", { cache: "no-store" });
      const statePayload = (await stateResponse.json().catch(() => null)) as
        | { data?: { status?: string } }
        | null;

      if (statePayload?.data?.status === "COMPLETED") {
        setMessage("Export completato. Percorso guidato concluso, reindirizzamento in corso...");
        window.setTimeout(() => {
          window.location.assign("/");
        }, 700);
        return;
      }

      setMessage("Export completato. Se non vedi il completamento, aggiorna la pagina.");
    } catch (exportError) {
      setError(exportError instanceof Error ? exportError.message : "Errore imprevisto");
    } finally {
      // Su ogni ramo, anche export riuscito senza completamento: i pulsanti non restano bloccati (T-1003).
      setLoading(null);
    }
  };

  // «Vai alla dashboard» mette in pausa il percorso: un link a / tornerebbe all'onboarding in corso (T-1002).
  const goToDashboard = async () => {
    setLeaving(true);
    setError(null);
    try {
      await pauseOnboardingAndOpenDashboard();
    } catch (pauseError) {
      setError(pauseError instanceof Error ? pauseError.message : "Errore imprevisto");
      setLeaving(false);
    }
  };

  return (
    <section className="card space-y-5">
      <div className="space-y-2">
        <h2 className="text-xl font-semibold">Step 7: Revisione (consigliata) + primo export</h2>
        <p className="text-sm text-slate-600">
          Apri i risultati per rifinire le keyword, poi esegui almeno un export per concludere il percorso.
        </p>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <article className="rounded-2xl border border-[var(--surface-border)] bg-[var(--surface-muted)] px-4 py-3">
          <p className="text-xs uppercase tracking-wide text-slate-500">Keyword sezione attiva</p>
          <p className="mt-1 text-2xl font-semibold">{sectionKeywordCount}</p>
        </article>
        <article className="rounded-2xl border border-[var(--surface-border)] bg-[var(--surface-muted)] px-4 py-3">
          <p className="text-xs uppercase tracking-wide text-slate-500">Keyword progetto</p>
          <p className="mt-1 text-2xl font-semibold">{projectKeywordCount}</p>
        </article>
      </div>

      <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap">
        <Link className="btn-secondary w-full text-center sm:w-auto" href={`/projects/${projectId}/results?subprojectId=${subprojectId}`}>
          Apri risultati sezione (review consigliata)
        </Link>
      </div>

      <div className="space-y-3 rounded-2xl border border-[var(--surface-border)] bg-[var(--surface-muted)] p-4">
        <p className="text-sm font-medium">Export rapido</p>
        <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap">
          <button
            type="button"
            className="btn-primary w-full sm:w-auto"
            onClick={() => void downloadExport("csv", "non-excluded")}
            disabled={Boolean(loading)}
          >
            {loading === "csv" ? "Export CSV..." : "Esporta CSV (non escluse)"}
          </button>
          <button
            type="button"
            className="btn-secondary w-full sm:w-auto"
            onClick={() => void downloadExport("xlsx", "filtered")}
            disabled={Boolean(loading)}
          >
            {loading === "xlsx" ? "Export XLSX..." : "Esporta XLSX (vista corrente)"}
          </button>
          <button
            type="button"
            className="btn-secondary w-full sm:w-auto"
            onClick={() => void downloadExport("json", "review")}
            disabled={Boolean(loading)}
          >
            {loading === "json" ? "Export JSON..." : "Esporta JSON (review)"}
          </button>
          <GoogleSheetsExportButton
            projectId={projectId}
            subprojectId={subprojectId}
            connected={googleSheetsConnected}
            defaultFileName={defaultSheetsFileName}
            filters={{}}
          />
        </div>
      </div>

      <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap">
        <Link className="btn-secondary w-full text-center sm:w-auto" href="/onboarding/run">
          Torna allo step precedente
        </Link>
        <button type="button" className="btn-secondary w-full sm:w-auto" onClick={() => void goToDashboard()} disabled={leaving}>
          {leaving ? "Salvataggio..." : "Vai alla dashboard"}
        </button>
      </div>

      {error && <p className="text-sm text-red-700">{error}</p>}
      {message && <p className="text-sm text-green-700">{message}</p>}
    </section>
  );
}
