import { NextResponse } from "next/server";
import { requireAdminUserFromRequest } from "@/lib/auth/current-user";
import { withApiErrors } from "@/lib/http/errors";
import { getBrandingSnapshot, updateBrandingSettings } from "@/lib/integrations/branding";

export const GET = withApiErrors(async (request: Request) => {
  await requireAdminUserFromRequest(request);
  const snapshot = await getBrandingSnapshot();
  return NextResponse.json({ data: snapshot });
});

export const PATCH = withApiErrors(async (request: Request) => {
  await requireAdminUserFromRequest(request);

  const payload = (await request.json()) as {
    appName?: string;
    logoUrl?: string | null;
    logoUrlDark?: string | null;
    logoUrlLight?: string | null;
  };

  // Un logo non valido arriva come ValidationError (400); ogni altro errore resta un 500 senza dettagli.
  const snapshot = await updateBrandingSettings({
    appName: payload.appName,
    logoUrl: payload.logoUrl,
    logoUrlDark: payload.logoUrlDark,
    logoUrlLight: payload.logoUrlLight,
  });

  return NextResponse.json({ data: snapshot });
});
