import { NextResponse } from "next/server";
import { requireAuthenticatedUserFromRequest } from "@/lib/auth/current-user";
import { startCheckout } from "@/lib/billing/actions";
import { withApiErrors } from "@/lib/http/errors";
import { getRequestId } from "@/lib/observability/request-id";

/** Checkout del workspace (T-1602): solo l'OWNER; il browser riceve solo l'id della transazione di Paddle. */
export const POST = withApiErrors(async (request: Request) => {
  const user = await requireAuthenticatedUserFromRequest(request);
  const { workspaceId, planId, interval } = (await request.json()) as Record<string, unknown>;
  const { transactionId } = await startCheckout(user, { workspaceId, planId, interval }, getRequestId(request));
  return NextResponse.json({ data: { transactionId } });
});
