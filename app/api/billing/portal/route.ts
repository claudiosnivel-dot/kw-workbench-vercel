import { NextResponse } from "next/server";
import { requireAuthenticatedUserFromRequest } from "@/lib/auth/current-user";
import { openBillingPortal } from "@/lib/billing/actions";
import { withApiErrors } from "@/lib/http/errors";
import { getRequestId } from "@/lib/observability/request-id";

/**
 * Portale cliente di Paddle (T-1604): solo l'OWNER. I link contengono un token temporaneo: risposta no-store, mai
 * salvati né loggati, da aprire in una nuova scheda e mai in un iframe (CWE-524, CWE-532).
 */
export const POST = withApiErrors(async (request: Request) => {
  const user = await requireAuthenticatedUserFromRequest(request);
  const { workspaceId } = (await request.json()) as Record<string, unknown>;
  const links = await openBillingPortal(user, workspaceId, getRequestId(request));
  return NextResponse.json(
    { data: { url: links.overview, updatePaymentMethod: links.updatePaymentMethod, cancel: links.cancel } },
    { headers: { "Cache-Control": "no-store" } }
  );
});
