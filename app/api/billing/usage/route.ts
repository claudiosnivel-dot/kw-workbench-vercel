import { NextResponse } from "next/server";
import { requireAuthenticatedUserFromRequest } from "@/lib/auth/current-user";
import { requireWorkspaceRole } from "@/lib/authz/workspace";
import { getEntitlements } from "@/lib/billing/entitlements";
import { getUsageSummary } from "@/lib/billing/usage";
import { withApiErrors } from "@/lib/http/errors";

/**
 * Uso del workspace (T-1703): qualsiasi membro; un non membro riceve 404 WORKSPACE_NOT_FOUND senza scoprire piano né
 * uso (CWE-639). Avvii di oggi e keyword del mese con i limiti del piano (null = illimitato) e l'azzeramento per metrica.
 */
export const GET = withApiErrors(async (request: Request) => {
  const user = await requireAuthenticatedUserFromRequest(request);
  const workspace = await requireWorkspaceRole(user, new URL(request.url).searchParams.get("workspaceId"), "workspace.read");
  const { limits } = await getEntitlements(workspace.id);
  const usage = await getUsageSummary(workspace.id, { runsPerDay: limits.runsPerDay, keywordsPerMonth: limits.keywordsPerMonth });
  return NextResponse.json({ data: usage });
});
