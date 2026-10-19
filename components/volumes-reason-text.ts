import { useTranslations } from "next-intl";
import type { MetricsNotice } from "@/lib/modules/providers/metrics/types";
import type { VolumesReason } from "@/lib/modules/volumes-reason";

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

/**
 * Testo del motivo dei volumi mancanti dal catalogo keywords.volumes.reason, mai dal fornitore (CWE-209); null per un
 * motivo senza testo. Lo usano il riquadro della pagina di un argomento (T-3704) e l'avviso di DataForSEO nella
 * Panoramica dell'amministrazione (T-3903).
 */
export function useVolumesReasonText(reason: VolumesReason | null | undefined): string | null {
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
