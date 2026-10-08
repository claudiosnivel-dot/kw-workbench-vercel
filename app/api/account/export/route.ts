import { accountExportStream } from "@/lib/account/export";
import { requireAuthenticatedUserFromRequest } from "@/lib/auth/current-user";
import { withApiErrors } from "@/lib/http/errors";
import { logger } from "@/lib/observability/logger";

/**
 * Export dei dati dell'account (T-1804, GDPR): JSON in streaming dei soli dati dell'utente della sessione e dei
 * workspace di cui è l'unico OWNER, scaricato come allegato e mai salvato in cache.
 */
export const GET = withApiErrors(async (request: Request) => {
  const user = await requireAuthenticatedUserFromRequest(request);
  const stream = accountExportStream(user.id, (error) => logger.error("account_export_failed", { userId: user.id, error }));

  return new Response(stream, {
    status: 200,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Content-Disposition": `attachment; filename="account-export-${new Date().toISOString().slice(0, 10)}.json"`,
      "Cache-Control": "no-store",
    },
  });
});
