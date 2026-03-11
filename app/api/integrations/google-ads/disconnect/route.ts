import { NextResponse } from "next/server";
import { clearGoogleAdsCredential } from "@/lib/integrations/google-ads";

export async function POST() {
  await clearGoogleAdsCredential();
  return NextResponse.json({ success: true });
}
