/**
 * Modello d'errore unico delle API (T-503).
 *
 * Ogni risposta d'errore prodotta da withApiErrors ha il body
 *   { error: string, code: string, requestId: string }
 * (più gli eventuali fields di un AppError, per esempio missing di ONBOARDING_PRECONDITION, T-1003)
 * e l'header x-request-id con lo stesso requestId.
 * - error: messaggio pubblico, scritto apposta in un AppError; mai il messaggio di un'eccezione
 *   non prevista (Prisma, host del DB, stack).
 * - code: codice stabile (VALIDATION_ERROR, INVALID_JSON, AUTH_REQUIRED, FORBIDDEN, NOT_FOUND,
 *   CONFLICT, INTERNAL_ERROR o un code esplicito di un AppError, come quelli dei job in JOB_ERROR_CODES), sempre
 *   uno di API_ERROR_CODES (T-1303), anche nelle risposte d'errore scritte direttamente dalle rotte.
 * - requestId: x-request-id assegnato dal proxy (getRequestId, T-602): quello in ingresso se conforme a
 *   ^[A-Za-z0-9-]{8,64}$, altrimenti un UUID.
 * Il client (lib/client/http.ts) mostra il testo del catalogo per il code, non error (T-1303).
 */
import { unstable_rethrow } from "next/navigation";
import { NextResponse } from "next/server";
import { Prisma } from "@/lib/generated/prisma/client";
import { AUTH_REQUIRED_CODE, AUTH_REQUIRED_MESSAGE, authRequiredResponse } from "@/lib/http/auth-required";
import { logger } from "@/lib/observability/logger";
import { getRequestId } from "@/lib/observability/request-id";

export { API_ERROR_CODES } from "@/lib/http/error-codes";
import type { ApiErrorCode } from "@/lib/http/error-codes";

/** Code dei job in background (T-1203, T-1204), con lo status HTTP con cui li usano le rotte. */
export const JOB_ERROR_CODES = {
  /** 401: firma assente, scaduta o non valida sulla rotta interna di avanzamento. */
  signatureInvalid: "JOB_SIGNATURE_INVALID",
  /** 401: Authorization del cron diversa da Bearer CRON_SECRET, o CRON_SECRET non configurata. */
  cronUnauthorized: "CRON_UNAUTHORIZED",
  /** 409: la sezione ha già un job pending o running; il body riporta il suo jobId. */
  alreadyActive: "JOB_ALREADY_ACTIVE",
  /** 404: job inesistente o di un progetto di un altro utente (mai 403, per non rivelarne l'esistenza). */
  notFound: "JOB_NOT_FOUND",
  /** 409: annullamento di un job già terminato (completed, failed o canceled). */
  notCancelable: "JOB_NOT_CANCELABLE",
} as const;

export class AppError extends Error {
  readonly status: number;
  readonly code: string;
  /** Campi pubblici aggiuntivi del body d'errore; non sostituiscono error, code e requestId. */
  readonly fields?: Record<string, string>;

  constructor(status: number, code: string, message: string, fields?: Record<string, string>) {
    super(message);
    this.name = "AppError";
    this.status = status;
    this.code = code;
    this.fields = fields;
  }
}

export class ValidationError extends AppError {
  constructor(message: string) {
    super(400, "VALIDATION_ERROR", message);
    this.name = "ValidationError";
  }
}

export class NotFoundError extends AppError {
  constructor(message = "Risorsa non trovata") {
    super(404, "NOT_FOUND", message);
    this.name = "NotFoundError";
  }
}

export class ConflictError extends AppError {
  constructor(message = "Risorsa già esistente") {
    super(409, "CONFLICT", message);
    this.name = "ConflictError";
  }
}

export class AuthRequiredError extends AppError {
  constructor() {
    super(401, AUTH_REQUIRED_CODE, AUTH_REQUIRED_MESSAGE);
    this.name = "AuthRequiredError";
  }
}

export class ForbiddenError extends AppError {
  constructor(message = "Operazione non autorizzata.") {
    super(403, "FORBIDDEN", message);
    this.name = "ForbiddenError";
  }
}

/**
 * Risposta d'errore restituita da una rotta senza eccezione (T-1303): body { error, code } con lo status. Il code è
 * uno di API_ERROR_CODES per costruzione, così il client trova sempre il testo nel catalogo.
 */
export function errorResponse(status: number, code: ApiErrorCode, error: string): Response {
  return NextResponse.json({ error, code }, { status });
}

function errorJson(
  status: number,
  code: string,
  error: string,
  requestId: string,
  fields?: Record<string, string>
): Response {
  return NextResponse.json({ ...fields, error, code, requestId }, { status });
}

function logInternalError(error: unknown, request: Request, requestId: string): void {
  // Una sola riga per ogni 500: il requestId mostrato al client ritrova l'errore nei log (T-602).
  logger.error("api_internal_error", {
    requestId,
    method: request.method,
    path: new URL(request.url).pathname,
    error,
  });
}

function toErrorResponse(error: unknown, request: Request, requestId: string): Response {
  if (error instanceof AuthRequiredError) {
    return authRequiredResponse({ requestId });
  }

  if (error instanceof AppError) {
    return errorJson(error.status, error.code, error.message, requestId, error.fields);
  }

  if (error instanceof SyntaxError) {
    return errorJson(400, "INVALID_JSON", "Corpo della richiesta non valido: è atteso un JSON", requestId);
  }

  if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
    return errorJson(409, "CONFLICT", "Risorsa già esistente", requestId);
  }

  if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2025") {
    return errorJson(404, "NOT_FOUND", "Risorsa non trovata", requestId);
  }

  logInternalError(error, request, requestId);
  return errorJson(500, "INTERNAL_ERROR", "Errore interno", requestId);
}

/** Avvolge un route handler App Router: ogni eccezione diventa una risposta nel formato documentato sopra. */
export function withApiErrors<Req extends Request, Ctx>(
  handler: (request: Req, context: Ctx) => Promise<Response> | Response
): (request: Req, context: Ctx) => Promise<Response> {
  return async (request, context) => {
    try {
      return await handler(request, context);
    } catch (error) {
      // redirect() e notFound() di Next lanciano errori interni che vanno lasciati passare.
      unstable_rethrow(error);
      const requestId = getRequestId(request);
      const response = toErrorResponse(error, request, requestId);
      response.headers.set("x-request-id", requestId);
      return response;
    }
  };
}
