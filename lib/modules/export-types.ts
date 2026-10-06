/** Formati e ambiti dell'export senza import server: li usano anche i componenti client (T-1102, D-22). */
export const EXPORT_FORMATS = ["csv", "xlsx", "json"] as const;
export const EXPORT_SCOPES = ["approved", "selected", "review", "non-excluded", "filtered"] as const;

export type ExportFormat = (typeof EXPORT_FORMATS)[number];
export type ExportScope = (typeof EXPORT_SCOPES)[number];
