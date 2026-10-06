"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { ApiErrorPayload, buildApiErrorMessage, readJsonSafe } from "@/lib/client/http";
import type { ExportScope } from "@/lib/modules/export-types";

type ExportModalResponse = ApiErrorPayload & {
  data?: {
    spreadsheetId: string;
    spreadsheetUrl: string;
    sheetCount: number;
    exportedRows: number;
  };
};

// Elementi che ricevono il focus con Tab dentro la modale.
const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

/** Primo campo del modulo, altrimenti il primo elemento attivabile della modale. */
function initialFocusTarget(dialog: HTMLElement): HTMLElement | null {
  return dialog.querySelector<HTMLElement>("input, select, textarea") ?? dialog.querySelector<HTMLElement>(FOCUSABLE);
}

/** Tab e Maiusc+Tab restano dentro la modale: dall'ultimo elemento si torna al primo e viceversa. */
function keepFocusInside(event: KeyboardEvent, dialog: HTMLElement): void {
  const focusable = [...dialog.querySelectorAll<HTMLElement>(FOCUSABLE)];
  if (focusable.length === 0) {
    event.preventDefault();
    return;
  }

  const first = focusable[0];
  const last = focusable[focusable.length - 1];
  const active = document.activeElement;
  if (event.shiftKey && (active === first || !dialog.contains(active))) {
    event.preventDefault();
    last.focus();
  } else if (!event.shiftKey && (active === last || !dialog.contains(active))) {
    event.preventDefault();
    first.focus();
  }
}

const EXPORT_SCOPE_OPTIONS: Array<{ value: ExportScope; label: string }> = [
  { value: "approved", label: "Solo approvate" },
  { value: "selected", label: "Solo selezionate" },
  { value: "review", label: "Solo review" },
  { value: "non-excluded", label: "Tutte non escluse" },
  { value: "filtered", label: "Vista filtrata corrente" },
];

type GoogleSheetsExportButtonProps = {
  projectId: string;
  subprojectId?: string | null;
  connected: boolean;
  defaultFileName: string;
  filters: Record<string, string | string[] | undefined>;
};

export function GoogleSheetsExportButton({
  projectId,
  subprojectId,
  connected,
  defaultFileName,
  filters,
}: GoogleSheetsExportButtonProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [scope, setScope] = useState<ExportScope>("non-excluded");
  const [fileName, setFileName] = useState(defaultFileName);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<ExportModalResponse["data"] | null>(null);
  const openerRef = useRef<HTMLButtonElement>(null);
  const dialogRef = useRef<HTMLDivElement>(null);

  // All'apertura il focus va al primo campo; alla chiusura torna al pulsante che ha aperto la modale (T-1104).
  useEffect(() => {
    if (!isOpen) {
      return;
    }

    const opener = openerRef.current;
    if (dialogRef.current) {
      initialFocusTarget(dialogRef.current)?.focus();
    }
    return () => opener?.focus();
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) {
      document.body.style.overflow = "";
      return;
    }

    document.body.style.overflow = "hidden";
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !loading) {
        setIsOpen(false);
      } else if (event.key === "Tab" && dialogRef.current) {
        keepFocusInside(event, dialogRef.current);
      }
    };

    window.addEventListener("keydown", onKeyDown);

    return () => {
      document.body.style.overflow = "";
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [isOpen, loading]);

  const openModal = () => {
    setError(null);
    setResult(null);
    setFileName(defaultFileName);
    setScope("non-excluded");
    setIsOpen(true);
  };

  const closeModal = () => {
    if (loading) {
      return;
    }

    setIsOpen(false);
  };

  const runExport = async () => {
    const trimmedFileName = fileName.trim();
    if (!trimmedFileName) {
      setError("Inserisci un nome file.");
      return;
    }

    setLoading(true);
    setError(null);
    setResult(null);

    try {
      const response = await fetch(`/api/projects/${projectId}/export/google-sheets`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          fileName: trimmedFileName,
          scope,
          subprojectId: subprojectId ?? undefined,
          filters,
        }),
      });

      const payload = await readJsonSafe<ExportModalResponse>(response);
      if (!response.ok) {
        throw new Error(buildApiErrorMessage(response, payload, "Esportazione Google Sheets non riuscita"));
      }

      setResult(payload?.data ?? null);
    } catch (exportError) {
      setError(exportError instanceof Error ? exportError.message : "Errore imprevisto");
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      <button ref={openerRef} className="btn-primary w-full sm:w-auto" type="button" onClick={openModal}>
        Esporta su Google Sheets
      </button>

      {isOpen && (
        <div
          className="fixed inset-0 z-50 overflow-y-auto bg-black/55 px-3 py-3 sm:px-5 sm:py-6"
          role="dialog"
          aria-modal="true"
          aria-labelledby="google-sheets-export-title"
          ref={dialogRef}
          onClick={closeModal}
        >
          <div className="flex min-h-full items-end justify-center sm:items-center">
            <div
              className="card w-full max-w-xl max-h-[92vh] overflow-y-auto"
              onClick={(event) => event.stopPropagation()}
            >
              <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                <h3 id="google-sheets-export-title" className="text-lg font-semibold">
                  Export Google Sheets
                </h3>
                <button className="btn-secondary w-full sm:w-auto" type="button" onClick={closeModal} disabled={loading}>
                  Chiudi
                </button>
              </div>

              <div className="mt-4 space-y-4">
                {!connected ? (
                  <div className="space-y-3">
                    <p className="text-sm text-slate-600">
                      Per esportare su Google Sheets devi prima collegare il tuo account Google da Personalizza.
                    </p>
                    <Link className="btn-primary w-full text-center sm:w-auto" href="/personalizza#google-sheets">
                      Vai a Personalizza
                    </Link>
                  </div>
                ) : (
                  <>
                    <div>
                      <label className="label" htmlFor="google-sheets-file-name">
                        Nome file Google Sheets
                      </label>
                      <input
                        id="google-sheets-file-name"
                        className="input"
                        value={fileName}
                        onChange={(event) => setFileName(event.target.value)}
                        placeholder="Piano editoriale keyword"
                      />
                    </div>

                    <div>
                      <label className="label" htmlFor="google-sheets-scope">
                        Scope export
                      </label>
                      <select
                        id="google-sheets-scope"
                        className="select"
                        value={scope}
                        onChange={(event) => setScope(event.target.value as ExportScope)}
                      >
                        {EXPORT_SCOPE_OPTIONS.map((option) => (
                          <option key={option.value} value={option.value}>
                            {option.label}
                          </option>
                        ))}
                      </select>
                    </div>

                    <p className="text-xs text-slate-500">
                      Ogni sezione del progetto con keyword esportate verra creata come foglio separato nel file.
                    </p>

                    <button className="btn-primary w-full sm:w-auto" type="button" onClick={runExport} disabled={loading}>
                      {loading ? "Esportazione in corso..." : "Esporta ora"}
                    </button>

                    {result?.spreadsheetUrl && (
                      <div className="space-y-2 rounded-xl border border-emerald-400/40 bg-emerald-500/15 p-3 text-sm text-emerald-200">
                        <p>
                          Export completato: {result.exportedRows} keyword su {result.sheetCount} fogli.
                        </p>
                        <a
                          className="btn-secondary w-full text-center sm:w-auto"
                          href={result.spreadsheetUrl}
                          target="_blank"
                          rel="noreferrer"
                        >
                          Apri file Google Sheets
                        </a>
                      </div>
                    )}
                  </>
                )}

                {error && <p className="text-sm text-red-700">{error}</p>}
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}