import { NextResponse } from "next/server";
import { errorResponse, withApiErrors } from "@/lib/http/errors";
import { markAgentKeyUsed, verifyAgentKey } from "@/lib/modules/agent/keys";
import { handleMcpMessage, JSON_RPC_ERRORS, rpcError } from "@/lib/modules/agent/server";
import { enforceRateLimits } from "@/lib/security/rate-limit";
import { rateLimitRules } from "@/lib/security/rate-limit-config";

export const runtime = "nodejs";

const BEARER = /^Bearer\s+(\S+)$/i;

/** Chiave di Claude Code dalla sola intestazione Authorization: mai dall'indirizzo né dai cookie (CWE-598). */
function bearerToken(request: Request): string | null {
  return BEARER.exec(request.headers.get("authorization") ?? "")?.[1] ?? null;
}

function unauthorized(): Response {
  const response = errorResponse(401, "AUTH_REQUIRED", "Chiave di Claude Code assente o non valida");
  response.headers.set("WWW-Authenticate", 'Bearer realm="titan-seo"');
  return response;
}

/**
 * Server MCP di Claude Code (T-7201, D-64), percorso pubblico del proxy che si autentica da solo: ogni richiesta rilegge
 * chiave, stato e ruolo del root admin (verifyAgentKey; il cookie di sessione non basta, CWE-306), aggiorna l'ultimo
 * uso della chiave e consuma il limite di 120 richieste al minuto per chiave (429 con Retry-After, CWE-770). Un
 * messaggio JSON-RPC 2.0 per richiesta: notifiche 202 senza corpo, corpo non JSON -32700 e richiesta non valida -32600
 * con 400, le altre risposte 200.
 */
export const POST = withApiErrors(async (request: Request) => {
  const caller = await verifyAgentKey(bearerToken(request));
  if (!caller) {
    return unauthorized();
  }
  await markAgentKeyUsed(caller.keyId);
  await enforceRateLimits([{ key: `agent-key:${caller.keyId}`, rule: rateLimitRules().agentKeyRequests }]);

  let message: unknown;
  try {
    message = JSON.parse(await request.text());
  } catch {
    return NextResponse.json(rpcError(null, JSON_RPC_ERRORS.parseError, "Parse error"), { status: 400 });
  }
  const reply = await handleMcpMessage(message, caller);
  if (reply === null) {
    return new Response(null, { status: 202 });
  }
  const invalid = "error" in reply && reply.error.code === JSON_RPC_ERRORS.invalidRequest;
  return NextResponse.json(reply, { status: invalid ? 400 : 200 });
});

/** Nessuno stream SSE né sessioni (D-64): GET e DELETE rispondono 405. */
function methodNotAllowed(): Response {
  return new Response(null, { status: 405, headers: { Allow: "POST" } });
}

export const GET = methodNotAllowed;
export const DELETE = methodNotAllowed;
