import { NextResponse } from "next/server";
import { listAdminWorkspaces } from "@/lib/admin/workspaces";
import { requireRootAdminUserFromRequest } from "@/lib/auth/current-user";
import { withApiErrors } from "@/lib/http/errors";

/**
 * Elenco dei workspace della piattaforma (T-3403): solo il root admin (admin non root e abbonati 403, anonimi 401), 50 per
 * pagina con la ricerca su nome del workspace e proprietario. Dei progetti esce solo il numero; risposta no-store.
 */
export const GET = withApiErrors(async (request: Request) => {
  await requireRootAdminUserFromRequest(request);
  const { searchParams } = new URL(request.url);
  const data = await listAdminWorkspaces({
    searchText: searchParams.get("searchText"),
    page: Number(searchParams.get("page") ?? 1),
  });
  return NextResponse.json({ data }, { headers: { "Cache-Control": "no-store" } });
});
