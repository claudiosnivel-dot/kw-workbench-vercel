import { NextResponse } from "next/server";
import { requireAuthenticatedUserFromRequest } from "@/lib/auth/current-user";
import { getBrandingSnapshot, updateBrandingSettings } from "@/lib/integrations/branding";

export async function GET(request: Request) {
  await requireAuthenticatedUserFromRequest(request);
  const snapshot = await getBrandingSnapshot();
  return NextResponse.json({ data: snapshot });
}

export async function PATCH(request: Request) {
  await requireAuthenticatedUserFromRequest(request);

  const payload = (await request.json()) as {
    appName?: string;
    logoUrl?: string | null;
  };

  try {
    const snapshot = await updateBrandingSettings({
      appName: payload.appName,
      logoUrl: payload.logoUrl,
    });

    return NextResponse.json({ data: snapshot });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Configurazione branding non valida";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}