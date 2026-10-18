/**
 * Motivo dei volumi mancanti dell'ultima ricerca completata di un argomento (T-3704, D-45): il codice di DataForSEO
 * dell'ultimo lotto non riuscito (null per un timeout o un errore di rete) oppure il metricsNotice della ricerca. Solo
 * il codice numerico, mai il messaggio del fornitore (CWE-209).
 */
export type VolumesReason = { kind: "provider"; code: number | null } | { kind: "notice"; notice: string };

/** Motivo dal result di un job (forma di toMetricsResult): prima l'errore del fornitore, poi il metricsNotice. */
export function volumesReasonOf(result: unknown): VolumesReason | null {
  if (!result || typeof result !== "object") {
    return null;
  }
  const { metricsProviderError, metricsNotice } = result as { metricsProviderError?: unknown; metricsNotice?: unknown };
  if (metricsProviderError && typeof metricsProviderError === "object") {
    const { code } = metricsProviderError as { code?: unknown };
    return { kind: "provider", code: Number.isInteger(code) ? (code as number) : null };
  }
  return typeof metricsNotice === "string" && metricsNotice ? { kind: "notice", notice: metricsNotice } : null;
}
