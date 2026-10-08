import { NextResponse } from "next/server";
import { listAuditLog } from "@/lib/admin/audit";
import { requireRootAdminUserFromRequest } from "@/lib/auth/current-user";
import { withApiErrors } from "@/lib/http/errors";

/**
 * Registro delle azioni amministrative (T-1704): solo il root admin (admin non root e abbonati 403, anonimi 401), 50
 * righe per pagina dalla più recente, cursore opaco della pagina successiva. Nessuna rotta di modifica o cancellazione.
 */
export const GET = withApiErrors(async (request: Request) => {
  await requireRootAdminUserFromRequest(request);
  const { rows, nextCursor } = await listAuditLog(new URL(request.url).searchParams.get("cursor"));
  return NextResponse.json({ data: rows, meta: { nextCursor } });
});
