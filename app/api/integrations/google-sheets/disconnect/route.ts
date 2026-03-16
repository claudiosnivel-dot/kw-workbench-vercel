import { NextResponse } from "next/server";
import { AuthRequiredError, requireAuthenticatedUserFromRequest } from "@/lib/auth/current-user";
import { clearGoogleSheetsCredential } from "@/lib/integrations/google-sheets";

function toResponseError(error: unknown) {
  if (error instanceof AuthRequiredError) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  return NextResponse.json({ error: error instanceof Error ? error.message : "Errore interno" }, { status: 500 });
}

export async function POST(request: Request) {
  try {
    const user = await requireAuthenticatedUserFromRequest(request);
    await clearGoogleSheetsCredential(user.id);
    return NextResponse.json({ success: true });
  } catch (error) {
    return toResponseError(error);
  }
}