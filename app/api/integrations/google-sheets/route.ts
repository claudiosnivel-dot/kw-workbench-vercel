import { NextResponse } from "next/server";
import { requireAuthenticatedUserFromRequest } from "@/lib/auth/current-user";
import { withApiErrors } from "@/lib/http/errors";
import { getGoogleSheetsCredentialSnapshot } from "@/lib/integrations/google-sheets";

export const GET = withApiErrors(async (request: Request) => {
  const user = await requireAuthenticatedUserFromRequest(request);
  const snapshot = await getGoogleSheetsCredentialSnapshot(user.id);

  return NextResponse.json({ data: snapshot });
});