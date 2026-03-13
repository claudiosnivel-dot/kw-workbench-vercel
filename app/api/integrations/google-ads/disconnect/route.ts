import { NextResponse } from "next/server";
import {
  AuthRequiredError,
  ForbiddenError,
  requireRootAdminUserFromRequest,
} from "@/lib/auth/current-user";
import { clearGoogleAdsCredential } from "@/lib/integrations/google-ads";

function toResponseError(error: unknown) {
  if (error instanceof AuthRequiredError) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (error instanceof ForbiddenError) {
    return NextResponse.json({ error: "Operazione riservata al root admin" }, { status: 403 });
  }

  return NextResponse.json({ error: error instanceof Error ? error.message : "Errore interno" }, { status: 500 });
}

export async function POST(request: Request) {
  try {
    await requireRootAdminUserFromRequest(request);
    await clearGoogleAdsCredential();
    return NextResponse.json({ success: true });
  } catch (error) {
    return toResponseError(error);
  }
}
