/**
 * Modello d'errore unico delle API (T-503).
 *
 * Ogni risposta d'errore prodotta da withApiErrors ha il body
 *   { error: string, code: string, requestId: string }
 * e l'header x-request-id con lo stesso requestId.
 * - error: messaggio pubblico, scritto apposta in un AppError; mai il messaggio di un'eccezione
 *   non prevista (Prisma, host del DB, stack).
 * - code: codice stabile (VALIDATION_ERROR, INVALID_JSON, AUTH_REQUIRED, FORBIDDEN, NOT_FOUND,
 *   CONFLICT, INTERNAL_ERROR o un code esplicito di un AppError).
 * - requestId: x-request-id della richiesta se conforme a ^[A-Za-z0-9-]{8,64}$, altrimenti un UUID.
 * Il client (lib/client/http.ts) continua a leggere error.
 */
import { unstable_rethrow } from "next/navigation";
import { NextResponse } from "next/server";
import { Prisma } from "@/lib/generated/prisma/client";
import { AUTH_REQUIRED_CODE, AUTH_REQUIRED_MESSAGE, authRequiredResponse } from "@/lib/http/auth-required";

export class AppError extends Error {
  readonly status: number;
  readonly code: string;

  constructor(status: number, code: string, message: string) {
    super(message);
    this.name = "AppError";
    this.status = status;
    this.code = code;
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

const REQUEST_ID_PATTERN = /^[A-Za-z0-9-]{8,64}$/;

function resolveRequestId(request: Request): string {
  const header = request.headers.get("x-request-id");
  return header && REQUEST_ID_PATTERN.test(header) ? header : crypto.randomUUID();
}

function errorJson(status: number, code: string, error: string, requestId: string): Response {
  return NextResponse.json({ error, code, requestId }, { status });
}

function logInternalError(error: unknown, request: Request, requestId: string): void {
  // Una sola riga per ogni 500: il requestId mostrato al client ritrova l'errore nei log (sostituita in T-602).
  console.error(
    JSON.stringify({
      level: "error",
      requestId,
      method: request.method,
      path: new URL(request.url).pathname,
      stack: error instanceof Error ? (error.stack ?? `${error.name}: ${error.message}`) : String(error),
    })
  );
}

function toErrorResponse(error: unknown, request: Request, requestId: string): Response {
  if (error instanceof AuthRequiredError) {
    return authRequiredResponse({ requestId });
  }

  if (error instanceof AppError) {
    return errorJson(error.status, error.code, error.message, requestId);
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
      const requestId = resolveRequestId(request);
      const response = toErrorResponse(error, request, requestId);
      response.headers.set("x-request-id", requestId);
      return response;
    }
  };
}
