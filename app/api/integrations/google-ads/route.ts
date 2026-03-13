import { NextResponse } from "next/server";
import {
  AuthRequiredError,
  ForbiddenError,
  requireRootAdminUserFromRequest,
} from "@/lib/auth/current-user";
import {
  getGoogleAdsCredentialSnapshot,
  updateGoogleAdsCustomerSettings,
} from "@/lib/integrations/google-ads";

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
    const snapshot = await getGoogleAdsCredentialSnapshot();

    return NextResponse.json({
      data: snapshot,
    });
  } catch (error) {
    return toResponseError(error);
  }
}

export async function PATCH(request: Request) {
  try {
    await requireRootAdminUserFromRequest(request);

    const payload = (await request.json()) as {
      customerId?: string;
      loginCustomerId?: string;
    };

    const updated = await updateGoogleAdsCustomerSettings({
      customerId: String(payload.customerId ?? "").trim() || undefined,
      loginCustomerId: String(payload.loginCustomerId ?? "").trim() || undefined,
    });

    if (!updated) {
      return NextResponse.json({ error: "Integrazione Google Ads non collegata" }, { status: 404 });
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
  } catch (error) {
    return toResponseError(error);
  }
}
