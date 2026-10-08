import { NextResponse } from "next/server";
import { getPlatformKpi, KPI_KEYS } from "@/lib/admin/kpi";
import { requireRootAdminUserFromRequest } from "@/lib/auth/current-user";
import { withApiErrors } from "@/lib/http/errors";

/**
 * Indicatori aggregati della piattaforma (T-1705): solo il root admin (admin non root e abbonati 403, anonimi 401). Il
 * corpo ha solo le chiavi della whitelist KPI_KEYS e solo numeri, nessun dato dei progetti degli utenti (CWE-200).
 */
export const GET = withApiErrors(async (request: Request) => {
  await requireRootAdminUserFromRequest(request);
  const kpi = await getPlatformKpi();
  return NextResponse.json(Object.fromEntries(KPI_KEYS.map((key) => [key, kpi[key]])));
});
