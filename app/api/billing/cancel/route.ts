import { NextResponse } from "next/server";
import { requireAuthenticatedUserFromRequest } from "@/lib/auth/current-user";
import { requestCancellation } from "@/lib/billing/actions";
import { withApiErrors } from "@/lib/http/errors";
import { getRequestId } from "@/lib/observability/request-id";

/** Disdetta a fine periodo (T-1604): solo l'OWNER; 202 perché la data di fine arriva con il webhook. */
export const POST = withApiErrors(async (request: Request) => {
  const user = await requireAuthenticatedUserFromRequest(request);
  const { workspaceId } = (await request.json()) as Record<string, unknown>;
  await requestCancellation(user, workspaceId, getRequestId(request));
  return NextResponse.json({ data: { requested: true } }, { status: 202 });
});
