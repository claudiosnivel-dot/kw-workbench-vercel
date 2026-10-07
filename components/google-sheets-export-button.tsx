"use client";

import Link from "next/link";
import { useTranslations } from "next-intl";
import { useEffect, useRef, useState } from "react";
import { ApiErrorPayload, messageOf, readApiResponse } from "@/lib/client/http";
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

const EXPORT_SCOPE_OPTIONS = ["approved", "selected", "review", "non-excluded", "filtered"] as const satisfies ReadonlyArray<ExportScope>;

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
  const t = useTranslations("export");
  const tErrors = useTranslations("errors");
  const tCommon = useTranslations("common");
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
      setError(t("sheets.fileNameRequired"));
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

      const payload = await readApiResponse<ExportModalResponse>(response, tErrors);

      setResult(payload?.data ?? null);
    } catch (exportError) {
      setError(messageOf(exportError, tCommon("unexpectedError")));
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      <button ref={openerRef} className="btn-primary w-full sm:w-auto" type="button" onClick={openModal}>
        {t("sheets.open")}
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
                  {t("sheets.title")}
                </h3>
                <button className="btn-secondary w-full sm:w-auto" type="button" onClick={closeModal} disabled={loading}>
                  {tCommon("close")}
                </button>
              </div>

              <div className="mt-4 space-y-4">
                {!connected ? (
                  <div className="space-y-3">
                    <p className="text-sm text-slate-600">{t("sheets.notConnected")}</p>
                    <Link className="btn-primary w-full text-center sm:w-auto" href="/personalizza#google-sheets">
                      {t("sheets.goToPersonalize")}
                    </Link>
                  </div>
                ) : (
                  <>
                    <div>
                      <label className="label" htmlFor="google-sheets-file-name">
                        {t("sheets.fileName")}
                      </label>
                      <input
                        id="google-sheets-file-name"
                        className="input"
                        value={fileName}
                        onChange={(event) => setFileName(event.target.value)}
                        placeholder={t("sheets.fileNamePlaceholder")}
                      />
                    </div>

                    <div>
                      <label className="label" htmlFor="google-sheets-scope">
                        {t("sheets.scope")}
                      </label>
                      <select
                        id="google-sheets-scope"
                        className="select"
                        value={scope}
                        onChange={(event) => setScope(event.target.value as ExportScope)}
                      >
                        {EXPORT_SCOPE_OPTIONS.map((option) => (
                          <option key={option} value={option}>
                            {t(`scopes.${option}`)}
                          </option>
                        ))}
                      </select>
                    </div>

                    <p className="text-xs text-slate-500">{t("sheets.hint")}</p>

                    <button className="btn-primary w-full sm:w-auto" type="button" onClick={runExport} disabled={loading}>
                      {loading ? t("sheets.exporting") : t("sheets.exportNow")}
                    </button>

                    {result?.spreadsheetUrl && (
                      <div className="space-y-2 rounded-xl border border-emerald-400/40 bg-emerald-500/15 p-3 text-sm text-emerald-200">
                        <p>{t("sheets.completed", { rows: result.exportedRows, sheets: result.sheetCount })}</p>
                        <a
                          className="btn-secondary w-full text-center sm:w-auto"
                          href={result.spreadsheetUrl}
                          target="_blank"
                          rel="noreferrer"
                        >
                          {t("sheets.openFile")}
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