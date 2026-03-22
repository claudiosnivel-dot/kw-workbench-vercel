import { NextRequest, NextResponse } from "next/server";
import { AuthRequiredError, requireAuthenticatedUserFromRequest } from "@/lib/auth/current-user";
import { skipOnboarding } from "@/lib/onboarding/progress";

export async function POST(request: NextRequest) {
  try {
    const user = await requireAuthenticatedUserFromRequest(request);
    const state = await skipOnboarding(user.id);
    return NextResponse.json({ data: state, meta: { nextPath: "/" } });
  } catch (error) {
    if (error instanceof AuthRequiredError) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    return NextResponse.json({ error: error instanceof Error ? error.message : "Errore interno" }, { status: 500 });
  }
}
