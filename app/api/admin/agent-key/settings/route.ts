import { NextResponse } from "next/server";
import { requireRootAdminUserFromRequest } from "@/lib/auth/current-user";
import { withApiErrors } from "@/lib/http/errors";
import { setAgentDailyCap } from "@/lib/modules/agent/spend";
import { getClientIp } from "@/lib/security/client-ip";

/**
 * Tetto giornaliero di spesa di Claude Code (T-7302, D-65): solo il root admin (admin non root e abbonati 403, anonimi
 * 401). PATCH con { dailyCapUsd } da 0 a 100 e al massimo due decimali; risponde con la spesa di oggi e il tetto nuovo.
 */
export const PATCH = withApiErrors(async (request: Request) => {
  const user = await requireRootAdminUserFromRequest(request);
  const data = await setAgentDailyCap(user, await request.json(), getClientIp(request));
  return NextResponse.json({ data }, { headers: { "Cache-Control": "no-store" } });
});
