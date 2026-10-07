"use client";

import Link from "next/link";
import { useTranslations } from "next-intl";
import { useMemo, useState } from "react";
import { CardIntro } from "@/components/card-intro";
import { GoogleSheetsExportButton } from "@/components/google-sheets-export-button";
import { OnboardingBackLink } from "@/components/onboarding-back-link";
import { type ApiErrorPayload, buildApiErrorMessage, messageOf, readJsonSafe } from "@/lib/client/http";
import { pauseOnboardingAndOpenDashboard } from "@/lib/client/onboarding";
import { useLeavingAction } from "@/lib/client/use-leaving-action";
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
  const t = useTranslations("onboarding");
  const tErrors = useTranslations("errors");
  const tCommon = useTranslations("common");
  const [loading, setLoading] = useState<ExportFormat | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const leaving = useLeavingAction();

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
        throw new Error(buildApiErrorMessage(response, payload, tErrors));
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
        setMessage(t("review.completedRedirect"));
        window.setTimeout(() => {
          window.location.assign("/");
        }, 700);
        return;
      }

      setMessage(t("review.completed"));
    } catch (exportError) {
      setError(messageOf(exportError, tCommon("unexpectedError")));
    } finally {
      // Su ogni ramo, anche export riuscito senza completamento: i pulsanti non restano bloccati (T-1003).
      setLoading(null);
    }
  };

  // «Vai alla dashboard» mette in pausa il percorso: un link a / tornerebbe all'onboarding in corso (T-1002).
  const goToDashboard = () => {
    setError(null);
    return leaving.run(pauseOnboardingAndOpenDashboard);
  };

  return (
    <section className="card space-y-5">
      <CardIntro variant="stepGroup" title={t("review.title")} intro={t("review.intro")} />

      <div className="grid gap-3 sm:grid-cols-2">
        <article className="rounded-2xl border border-[var(--surface-border)] bg-[var(--surface-muted)] px-4 py-3">
          <p className="text-xs uppercase tracking-wide text-slate-500">{t("review.sectionKeywords")}</p>
          <p className="mt-1 text-2xl font-semibold">{sectionKeywordCount}</p>
        </article>
        <article className="rounded-2xl border border-[var(--surface-border)] bg-[var(--surface-muted)] px-4 py-3">
          <p className="text-xs uppercase tracking-wide text-slate-500">{t("review.projectKeywords")}</p>
          <p className="mt-1 text-2xl font-semibold">{projectKeywordCount}</p>
        </article>
      </div>

      <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap">
        <Link className="btn-secondary w-full text-center sm:w-auto" href={`/projects/${projectId}/results?subprojectId=${subprojectId}`}>
          {t("review.openResults")}
        </Link>
      </div>

      <div className="space-y-3 rounded-2xl border border-[var(--surface-border)] bg-[var(--surface-muted)] p-4">
        <p className="text-sm font-medium">{t("review.quickExport")}</p>
        <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap">
          <button
            type="button"
            className="btn-primary w-full sm:w-auto"
            onClick={() => void downloadExport("csv", "non-excluded")}
            disabled={Boolean(loading)}
          >
            {loading === "csv" ? t("review.exporting", { format: "CSV" }) : t("review.csv")}
          </button>
          <button
            type="button"
            className="btn-secondary w-full sm:w-auto"
            onClick={() => void downloadExport("xlsx", "filtered")}
            disabled={Boolean(loading)}
          >
            {loading === "xlsx" ? t("review.exporting", { format: "XLSX" }) : t("review.xlsx")}
          </button>
          <button
            type="button"
            className="btn-secondary w-full sm:w-auto"
            onClick={() => void downloadExport("json", "review")}
            disabled={Boolean(loading)}
          >
            {loading === "json" ? t("review.exporting", { format: "JSON" }) : t("review.json")}
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
        <OnboardingBackLink href="/onboarding/run" />
        <button type="button" className="btn-secondary w-full sm:w-auto" onClick={() => void goToDashboard()} disabled={leaving.pending !== null}>
          {leaving.pending ? tCommon("saving") : t("review.goToDashboard")}
        </button>
      </div>

      {(error ?? leaving.error) && <p className="text-sm text-red-700">{error ?? leaving.error}</p>}
      {message && <p className="text-sm text-green-700">{message}</p>}
    </section>
  );
}
