import { NextResponse } from "next/server";
import { requireAuthenticatedUserFromRequest } from "@/lib/auth/current-user";
import { clearGoogleAdsCredential } from "@/lib/integrations/google-ads";

export async function POST(request: Request) {
  const user = await requireAuthenticatedUserFromRequest(request);
  await clearGoogleAdsCredential(user.id);
  return NextResponse.json({ success: true });
}
