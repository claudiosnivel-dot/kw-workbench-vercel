/** Formati e ambiti dell'export senza import server: li usano anche i componenti client (T-1102, D-22). */
export const EXPORT_FORMATS = ["csv", "xlsx", "json"] as const;
// Ambiti dell'export (T-2402, D-23 emendata): tenute, tutte (scartate comprese) e la vista filtrata.
export const EXPORT_SCOPES = ["kept", "all", "filtered"] as const;

export type ExportFormat = (typeof EXPORT_FORMATS)[number];
export type ExportScope = (typeof EXPORT_SCOPES)[number];
