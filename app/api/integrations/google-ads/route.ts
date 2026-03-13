import { NextResponse } from "next/server";
import { requireAuthenticatedUserFromRequest } from "@/lib/auth/current-user";
import {
  getGoogleAdsCredentialSnapshot,
  updateGoogleAdsCustomerSettings,
} from "@/lib/integrations/google-ads";

export async function GET(request: Request) {
  const user = await requireAuthenticatedUserFromRequest(request);
  const snapshot = await getGoogleAdsCredentialSnapshot(user.id);

  return NextResponse.json({
    data: snapshot,
  });
}

export async function PATCH(request: Request) {
  const user = await requireAuthenticatedUserFromRequest(request);

  const payload = (await request.json()) as {
    customerId?: string;
    loginCustomerId?: string;
  };

  const updated = await updateGoogleAdsCustomerSettings({
    userId: user.id,
    customerId: String(payload.customerId ?? "").trim() || undefined,
    loginCustomerId: String(payload.loginCustomerId ?? "").trim() || undefined,
  });

  if (!updated) {
    return NextResponse.json({ error: "Account Google Ads non collegato" }, { status: 404 });
  }

  return NextResponse.json({
    data: {
      connected: true,
      connectedEmail: updated.connected_email,
      customerId: updated.customer_id,
      loginCustomerId: updated.login_customer_id,
      scope: updated.scope,
      tokenType: updated.token_type,
      updatedAt: updated.updated_at,
    },
  });
}
