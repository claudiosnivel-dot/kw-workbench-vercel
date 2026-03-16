import { NextResponse } from "next/server";
import {
  AuthRequiredError,
  ForbiddenError,
  requireRootAdminUserFromRequest,
} from "@/lib/auth/current-user";
import {
  getGoogleSheetsApiConfigSnapshot,
  updateGoogleSheetsApiConfig,
} from "@/lib/integrations/google-sheets-config";

function toResponseError(error: unknown) {
  if (error instanceof AuthRequiredError) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (error instanceof ForbiddenError) {
    return NextResponse.json({ error: "Operazione riservata al root admin" }, { status: 403 });
  }

  return NextResponse.json({ error: error instanceof Error ? error.message : "Errore interno" }, { status: 500 });
}

export async function GET(request: Request) {
  try {
    await requireRootAdminUserFromRequest(request);
    const snapshot = await getGoogleSheetsApiConfigSnapshot();
    return NextResponse.json({ data: snapshot });
  } catch (error) {
    return toResponseError(error);
  }
}

export async function PATCH(request: Request) {
  try {
    await requireRootAdminUserFromRequest(request);

    const payload = (await request.json()) as {
      clientId?: string;
      clientSecret?: string;
      redirectUri?: string;
    };

    const snapshot = await updateGoogleSheetsApiConfig({
      clientId: payload.clientId,
      clientSecret: payload.clientSecret,
      redirectUri: payload.redirectUri,
    });

    return NextResponse.json({ data: snapshot });
  } catch (error) {
    return toResponseError(error);
  }
}