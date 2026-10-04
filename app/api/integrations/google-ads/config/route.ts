import { NextResponse } from "next/server";
import { requireRootAdminUserFromRequest } from "@/lib/auth/current-user";
import { withApiErrors } from "@/lib/http/errors";
import {
  getGoogleAdsApiConfigSnapshot,
  updateGoogleAdsApiConfig,
} from "@/lib/integrations/google-ads-config";

export const GET = withApiErrors(async (request: Request) => {
  await requireRootAdminUserFromRequest(request);
  const snapshot = await getGoogleAdsApiConfigSnapshot();
  return NextResponse.json({ data: snapshot });
});

export const PATCH = withApiErrors(async (request: Request) => {
  await requireRootAdminUserFromRequest(request);

  const payload = (await request.json()) as {
    developerToken?: string;
    clientId?: string;
    clientSecret?: string;
    redirectUri?: string;
    apiVersion?: string;
    batchSize?: number;
  };

  const snapshot = await updateGoogleAdsApiConfig({
    developerToken: payload.developerToken,
    clientId: payload.clientId,
    clientSecret: payload.clientSecret,
    redirectUri: payload.redirectUri,
    apiVersion: payload.apiVersion,
    batchSize: typeof payload.batchSize === "number" ? payload.batchSize : undefined,
  });

  return NextResponse.json({ data: snapshot });
});
