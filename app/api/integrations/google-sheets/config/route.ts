import { NextResponse } from "next/server";
import { requireRootAdminUserFromRequest } from "@/lib/auth/current-user";
import { withApiErrors } from "@/lib/http/errors";
import {
  getGoogleSheetsApiConfigSnapshot,
  parseGoogleSheetsConfigPatch,
  updateGoogleSheetsApiConfig,
} from "@/lib/integrations/google-sheets-config";

export const GET = withApiErrors(async (request: Request) => {
  await requireRootAdminUserFromRequest(request);
  const snapshot = await getGoogleSheetsApiConfigSnapshot();
  return NextResponse.json({ data: snapshot });
});

/** PATCH della configurazione (T-908): validata per intero prima di scrivere; null rimuove un override. */
export const PATCH = withApiErrors(async (request: Request) => {
  await requireRootAdminUserFromRequest(request);

  const payload: unknown = await request.json().catch(() => null);
  const snapshot = await updateGoogleSheetsApiConfig(parseGoogleSheetsConfigPatch(payload));

  return NextResponse.json({ data: snapshot });
});
