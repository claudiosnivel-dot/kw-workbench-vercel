import { NextResponse } from "next/server";
import { requireAuthenticatedUserFromRequest } from "@/lib/auth/current-user";
import { requestPlanChange } from "@/lib/billing/actions";
import { withApiErrors } from "@/lib/http/errors";
import { getRequestId } from "@/lib/observability/request-id";

/** Cambio piano (T-1604): solo l'OWNER; 202 perché il piano locale cambia solo con il webhook subscription.updated. */
export const POST = withApiErrors(async (request: Request) => {
  const user = await requireAuthenticatedUserFromRequest(request);
  const { workspaceId, planId, interval } = (await request.json()) as Record<string, unknown>;
  await requestPlanChange(user, { workspaceId, planId, interval }, getRequestId(request));
  return NextResponse.json({ data: { requested: true } }, { status: 202 });
});
