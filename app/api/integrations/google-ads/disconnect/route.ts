import { NextResponse } from "next/server";
import { requireRootAdminUserFromRequest } from "@/lib/auth/current-user";
import { withApiErrors } from "@/lib/http/errors";
import { clearGoogleAdsCredential } from "@/lib/integrations/google-ads";

export const POST = withApiErrors(async (request: Request) => {
  await requireRootAdminUserFromRequest(request);
  await clearGoogleAdsCredential();
  return NextResponse.json({ success: true });
});
