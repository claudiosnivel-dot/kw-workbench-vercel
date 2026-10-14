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
