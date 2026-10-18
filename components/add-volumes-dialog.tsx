"use client";

import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { ModalDialog } from "@/components/modal-dialog";
import { PlannerExportDownload } from "@/components/planner-export-download";
import { PlannerImportUpload } from "@/components/planner-import-upload";
import { readApiResponse, sendJson } from "@/lib/client/http";
import { useTopicSearch } from "@/lib/client/run-extraction";
import { usePendingAction } from "@/lib/client/use-pending-action";
import type { MetricsNotice } from "@/lib/modules/providers/metrics/types";
import type { VolumesReason } from "@/lib/modules/volumes-reason";

type AddVolumesProps = {
  projectId: string;
  topicId: string;
  /** Il fornitore con licenza è ammesso per l'utente e il progetto (canChooseLicensedMetrics, T-2003). */
  canAuto: boolean;
};

/**
 * Dialogo «Aggiungi i volumi» (T-2405). Opzione automatica solo con canAuto: imposta DATAFORSEO sull'argomento con la
 * PATCH (verificata lato server da assertLicensedMetricsChoice, D-30) e rilancia la ricerca; tieni/scarta restano (D-19).
 * Percorso guidato sempre: scarica il file per Keyword Planner (T-904), istruzioni, carica il file esportato (T-910).
 */
export function AddVolumesDialog({ projectId, topicId, canAuto, onClose }: AddVolumesProps & { onClose: () => void }) {
  const { pending, error, run } = usePendingAction();
  const startSearch = useTopicSearch();
  const t = useTranslations("keywords.volumes");
  const tErrors = useTranslations("errors");
  const router = useRouter();

  const runAutomatic = () =>
    run(async () => {
      const topicUrl = `/api/projects/${projectId}/subprojects/${topicId}`;
      await readApiResponse(await sendJson("PATCH", topicUrl, { metrics_provider_override: "DATAFORSEO" }), tErrors);
      await startSearch(projectId, topicId);
      onClose();
      router.refresh();
    });

  return (
    <ModalDialog title={t("title")} onClose={() => !pending && onClose()}>
      {canAuto && (
        <div className="space-y-2 rounded-xl border border-[var(--surface-border)] p-3">
          <h3 className="font-semibold">{t("autoTitle")}</h3>
          <p className="text-sm text-slate-600">{t("autoText")}</p>
          <button type="button" className="btn-primary" disabled={pending} onClick={runAutomatic}>
            {pending ? t("autoRunning") : t("autoButton")}
          </button>
          {error && (
            <p className="text-sm text-red-700" role="alert">
              {error}
            </p>
          )}
        </div>
      )}
      <div className="space-y-3">
        <h3 className="font-semibold">{t("guidedTitle")}</h3>
        <ol className="space-y-3 text-sm">
          <li className="space-y-2">
            <p>{t("step1")}</p>
            <PlannerExportDownload projectId={projectId} subprojectId={topicId} />
          </li>
          <li>
            <p>{t("step2")}</p>
          </li>
          <li className="space-y-2">
            <p>{t("step3")}</p>
            <PlannerImportUpload projectId={projectId} subprojectId={topicId} />
          </li>
        </ol>
      </div>
      <div className="flex justify-end">
        <button type="button" className="btn-secondary" onClick={onClose} disabled={pending}>
          {t("close")}
        </button>
      </div>
    </ModalDialog>
  );
}

// Motivi con un testo dedicato (T-3704): i codici di DataForSEO verificati il 2026-10-18 e ogni metricsNotice.
const PROVIDER_CODE_KEYS: Record<number, "credentials" | "verifyAccount"> = { 40100: "credentials", 40104: "verifyAccount" };
const NOTICE_KEYS = [
  "PROVIDER_NOT_CONFIGURED",
  "LOCATION_UNSUPPORTED",
  "LANGUAGE_UNSUPPORTED",
  "METRICS_BUDGET_EXCEEDED",
  "RUN_BUDGET_EXCEEDED",
  "PLAN_NO_LICENSED_METRICS",
  "LICENSED_METRICS_QUOTA_EXCEEDED",
] as const satisfies readonly MetricsNotice[];

function isNoticeKey(notice: string): notice is (typeof NOTICE_KEYS)[number] {
  return (NOTICE_KEYS as readonly string[]).includes(notice);
}

/** Testo del motivo dal catalogo, mai dal fornitore (CWE-209); null per un motivo senza testo. */
function useReasonText(reason: VolumesReason | null | undefined): string | null {
  const t = useTranslations("keywords.volumes.reason");
  if (!reason) {
    return null;
  }
  if (reason.kind === "notice") {
    return isNoticeKey(reason.notice) ? t(`notice.${reason.notice}`) : null;
  }
  if (reason.code === null) {
    return t("noResponse");
  }
  const key = PROVIDER_CODE_KEYS[reason.code];
  // Il codice come testo: un numero passerebbe dal formato della lingua («40.999»).
  return key ? t(key) : t("code", { code: String(reason.code) });
}

/**
 * Riquadro della pagina di un argomento quando le keyword tenute non hanno ancora le ricerche al mese (T-2405): una
 * frase e il pulsante «Aggiungi i volumi», che apre il dialogo. Sotto la frase, il motivo dell'ultima ricerca
 * completata, se il suo esito ne ha uno (T-3704).
 */
export function AddVolumesNotice({ reason, ...props }: AddVolumesProps & { reason?: VolumesReason | null }) {
  const t = useTranslations("keywords.volumes");
  const reasonText = useReasonText(reason);
  const [open, setOpen] = useState(false);

  return (
    <div className="flex flex-col gap-2 rounded-xl border border-amber-400/40 bg-amber-500/15 px-3 py-2 sm:flex-row sm:items-center sm:justify-between">
      <div className="space-y-1 text-sm text-amber-200">
        <p>{t("notice")}</p>
        {reasonText && <p>{reasonText}</p>}
      </div>
      <button type="button" className="btn-secondary" onClick={() => setOpen(true)}>
        {t("open")}
      </button>
      {open && <AddVolumesDialog {...props} onClose={() => setOpen(false)} />}
    </div>
  );
}
