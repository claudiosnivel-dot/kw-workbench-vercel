import { NextResponse } from "next/server";
import { requireRootAdminUserFromRequest } from "@/lib/auth/current-user";
import { withApiErrors } from "@/lib/http/errors";
import { getMetricsSpend } from "@/lib/modules/providers/metrics/metrics-ledger";

/** Spesa del mese UTC verso il fornitore di metriche (T-903): solo il root admin (CWE-285). */
export const GET = withApiErrors(async (request: Request) => {
  await requireRootAdminUserFromRequest(request);
  return NextResponse.json({ data: await getMetricsSpend() });
});
