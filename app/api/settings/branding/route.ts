import { NextResponse } from "next/server";
import {
  AuthRequiredError,
  ForbiddenError,
  requireAdminUserFromRequest,
} from "@/lib/auth/current-user";
import { getBrandingSnapshot, updateBrandingSettings } from "@/lib/integrations/branding";

function toResponseError(error: unknown) {
  if (error instanceof AuthRequiredError) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (error instanceof ForbiddenError) {
    return NextResponse.json({ error: "Operazione riservata agli admin" }, { status: 403 });
  }

  return NextResponse.json({ error: error instanceof Error ? error.message : "Errore interno" }, { status: 500 });
}

export async function GET(request: Request) {
  try {
    await requireAdminUserFromRequest(request);
    const snapshot = await getBrandingSnapshot();
    return NextResponse.json({ data: snapshot });
  } catch (error) {
    return toResponseError(error);
  }
}

export async function PATCH(request: Request) {
  try {
    await requireAdminUserFromRequest(request);

    const payload = (await request.json()) as {
      appName?: string;
      logoUrl?: string | null;
    };

    const snapshot = await updateBrandingSettings({
      appName: payload.appName,
      logoUrl: payload.logoUrl,
    });

    return NextResponse.json({ data: snapshot });
  } catch (error) {
    if (error instanceof Error && !(error instanceof AuthRequiredError) && !(error instanceof ForbiddenError)) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    return toResponseError(error);
  }
}
