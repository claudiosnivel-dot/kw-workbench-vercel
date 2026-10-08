import { NextResponse } from "next/server";
import { requireAdminUserFromRequest, requireRootAdminUserFromRequest } from "@/lib/auth/current-user";
import { withApiErrors } from "@/lib/http/errors";
import { getBrandingSnapshot, updateBrandingSettings } from "@/lib/integrations/branding";
import { getClientIp } from "@/lib/security/client-ip";

export const GET = withApiErrors(async (request: Request) => {
  await requireAdminUserFromRequest(request);
  const snapshot = await getBrandingSnapshot();
  return NextResponse.json({ data: snapshot });
});

export const PATCH = withApiErrors(async (request: Request) => {
  // Il branding è globale: lo modifica solo il root admin (403 FORBIDDEN per gli altri admin, T-506).
  const actor = await requireRootAdminUserFromRequest(request);

  const payload = (await request.json()) as {
    appName?: string;
    logoUrl?: string | null;
    logoUrlDark?: string | null;
    logoUrlLight?: string | null;
  };

  // Un campo non valido arriva come ValidationError (400) prima di ogni scrittura; ogni altro errore è un 500.
  const snapshot = await updateBrandingSettings(
    {
      appName: payload.appName,
      logoUrl: payload.logoUrl,
      logoUrlDark: payload.logoUrlDark,
      logoUrlLight: payload.logoUrlLight,
    },
    { actorUserId: actor.id, ip: getClientIp(request) }
  );

  return NextResponse.json({ data: snapshot });
});
