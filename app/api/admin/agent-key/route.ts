import { NextResponse } from "next/server";
import { requireRootAdminUserFromRequest } from "@/lib/auth/current-user";
import { withApiErrors } from "@/lib/http/errors";
import { readAgentActivity } from "@/lib/modules/agent/activity";
import { agentKeyStatus, createAgentKey, revokeAgentKey } from "@/lib/modules/agent/keys";
import { getClientIp } from "@/lib/security/client-ip";

const NO_STORE = { "Cache-Control": "no-store" };

/**
 * Chiave di Claude Code del root admin (T-7101, D-64): solo il root admin (admin non root e abbonati 403, anonimi 401).
 * GET dà lo stato dell'ultima chiave senza la chiave e, in activity, le ultime 50 chiamate di Claude Code e la spesa di
 * oggi con il tetto (T-7602); risposte no-store.
 */
export const GET = withApiErrors(async (request: Request) => {
  const user = await requireRootAdminUserFromRequest(request);
  const [data, activity] = await Promise.all([agentKeyStatus(user), readAgentActivity(user)]);
  return NextResponse.json({ data, activity }, { headers: NO_STORE });
});

/** Crea la chiave con { duration } (30, 60, 90 o "never") e revoca la precedente: 201 con la chiave, l'unica volta. */
export const POST = withApiErrors(async (request: Request) => {
  const user = await requireRootAdminUserFromRequest(request);
  const data = await createAgentKey(user, await request.json(), getClientIp(request));
  return NextResponse.json({ data }, { status: 201, headers: NO_STORE });
});

/** Revoca subito la chiave attiva; senza chiave attiva non cambia nulla. */
export const DELETE = withApiErrors(async (request: Request) => {
  const user = await requireRootAdminUserFromRequest(request);
  return NextResponse.json({ data: await revokeAgentKey(user, getClientIp(request)) }, { headers: NO_STORE });
});
