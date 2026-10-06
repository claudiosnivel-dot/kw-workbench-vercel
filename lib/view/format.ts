/** Formattazione condivisa da pagine e componenti client: nessun import server (T-1102, D-22). */
import type { createFormatter } from "next-intl";

/** Formatter di next-intl: getFormatter() nei Server Component, useFormatter() nei Client Component (T-1302). */
type DateFormatter = Pick<ReturnType<typeof createFormatter>, "dateTime">;

/** Data e ora brevi nella lingua corrente; assente → "-", stringa che non è una data → restituita com'è. */
export function formatDate(value: Date | string | null | undefined, format: DateFormatter): string {
  if (!value) return "-";
  const date = typeof value === "string" ? new Date(value) : value;
  if (Number.isNaN(date.getTime())) return String(value);
  return format.dateTime(date, { dateStyle: "short", timeStyle: "short" });
}

/** Classi del chip di stato di un job. */
export function jobStatusTone(value: string): string {
  if (value === "completed") return "border-emerald-400/40 bg-emerald-500/15 text-emerald-200";
  if (value === "failed") return "border-rose-400/40 bg-rose-500/15 text-rose-200";
  if (value === "running") return "border-amber-400/40 bg-amber-500/15 text-amber-200";
  // Annullato dall'utente (T-1201): tono neutro attenuato, con le classi rimappate sui token del tema.
  if (value === "canceled") return "border-slate-300 bg-slate-100 text-slate-500";
  return "border-slate-500/40 bg-slate-700/25 text-slate-200";
}
