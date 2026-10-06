import { NextResponse } from "next/server";
import { requireAuthenticatedUserFromRequest } from "@/lib/auth/current-user";
import { withApiErrors } from "@/lib/http/errors";
import { revokeAndClearGoogleSheetsCredential } from "@/lib/integrations/google-sheets";

/** Disconnessione di Google Sheets: token revocato presso Google se possibile, credenziale sempre cancellata (T-906). */
export const POST = withApiErrors(async (request: Request) => {
  const user = await requireAuthenticatedUserFromRequest(request);
  const revoked = await revokeAndClearGoogleSheetsCredential(user.id);
  return NextResponse.json({ success: true, revoked });
});
