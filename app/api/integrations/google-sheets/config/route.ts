import { NextResponse } from "next/server";
import { requireRootAdminUserFromRequest } from "@/lib/auth/current-user";
import { withApiErrors } from "@/lib/http/errors";
import {
  getGoogleSheetsApiConfigSnapshot,
  updateGoogleSheetsApiConfig,
} from "@/lib/integrations/google-sheets-config";

export const GET = withApiErrors(async (request: Request) => {
  await requireRootAdminUserFromRequest(request);
  const snapshot = await getGoogleSheetsApiConfigSnapshot();
  return NextResponse.json({ data: snapshot });
});

export const PATCH = withApiErrors(async (request: Request) => {
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
});