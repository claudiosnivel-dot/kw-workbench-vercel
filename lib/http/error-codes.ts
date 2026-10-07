// Nessun import: il modulo serve alle rotte (tramite lib/http/errors.ts) e al client (lib/client/http.ts).

/**
 * Elenco chiuso dei code d'errore emessi dalle rotte (T-1303). Ogni code ha la voce errors.<CODE> nei cataloghi
 * it ed en: per un code dell'elenco il client mostra solo quel testo, mai il messaggio error del server (CWE-209).
 */
export const API_ERROR_CODES = [
  // Modello d'errore comune (T-503).
  "VALIDATION_ERROR",
  "INVALID_JSON",
  "AUTH_REQUIRED",
  "FORBIDDEN",
  "NOT_FOUND",
  "CONFLICT",
  "INTERNAL_ERROR",
  // Accesso, registrazione e account.
  "INVALID_CREDENTIALS",
  "ACCOUNT_SUSPENDED",
  "REGISTRATION_UNAVAILABLE",
  "SIGNUP_DISABLED",
  "CREDENTIALS_REQUIRED",
  "PASSWORD_MISMATCH",
  "CURRENT_PASSWORD_REQUIRED",
  "CURRENT_PASSWORD_INVALID",
  "NO_CHANGES",
  "USER_NOT_FOUND",
  "SELF_ACTION_FORBIDDEN",
  // Lingua dell'interfaccia (T-1301).
  "LOCALE_UNSUPPORTED",
  // Progetti e sezioni.
  "PROJECT_NOT_FOUND",
  "SECTION_NOT_FOUND",
  "SECTION_NAME_TAKEN",
  "LAST_SECTION",
  "NO_SECTIONS",
  "FORBIDDEN_FIELD",
  // Job in background (T-1203, T-1204).
  "JOB_SIGNATURE_INVALID",
  "CRON_UNAUTHORIZED",
  "JOB_ALREADY_ACTIVE",
  "JOB_NOT_FOUND",
  "JOB_NOT_CANCELABLE",
  // Percorso guidato.
  "ONBOARDING_ENTRY_MODE_FORBIDDEN",
  "ONBOARDING_STATUS_FORBIDDEN",
  "ONBOARDING_PRECONDITION",
  "INVALID_IDEMPOTENCY_KEY",
  "IDEMPOTENCY_KEY_CONFLICT",
  // Export dei risultati.
  "EXPORT_FORMAT_INVALID",
  "EXPORT_SCOPE_INVALID",
  "EXPORT_DIALECT_INVALID",
  // Google Sheets.
  "SHEETS_FILE_NAME_REQUIRED",
  "SHEETS_NOT_CONNECTED",
  "SHEETS_OAUTH_CONFIG_MISSING",
  "SHEETS_TIMEOUT",
  "SHEETS_NO_ROWS",
  "GOOGLE_SHEETS_EXPORT_ERROR",
  "GOOGLE_REAUTH_REQUIRED",
  // Keyword Planner.
  "FILE_TOO_LARGE",
  "PLANNER_FILE_REQUIRED",
  "PLANNER_FILE_TYPE_INVALID",
  "PLANNER_KEYWORD_COLUMN_MISSING",
  "PLANNER_TOO_MANY_ROWS",
  "PLANNER_PART_NOT_FOUND",
] as const;

export type ApiErrorCode = (typeof API_ERROR_CODES)[number];

export function isApiErrorCode(value: unknown): value is ApiErrorCode {
  return typeof value === "string" && (API_ERROR_CODES as readonly string[]).includes(value);
}
