import { NextResponse } from "next/server";
import { requireAuthenticatedUserFromRequest } from "@/lib/auth/current-user";
import { withApiErrors } from "@/lib/http/errors";
import { clearGoogleSheetsCredential } from "@/lib/integrations/google-sheets";

export const POST = withApiErrors(async (request: Request) => {
  const user = await requireAuthenticatedUserFromRequest(request);
  await clearGoogleSheetsCredential(user.id);
  return NextResponse.json({ success: true });
});