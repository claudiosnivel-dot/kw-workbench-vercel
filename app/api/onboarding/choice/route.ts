import { NextRequest, NextResponse } from "next/server";
import { AuthRequiredError, requireAuthenticatedUserFromRequest } from "@/lib/auth/current-user";
import { applyOnboardingChoice } from "@/lib/onboarding/progress";
import { stepToPath } from "@/lib/onboarding/constants";

type ChoicePayload = {
  mode?: unknown;
};

export async function POST(request: NextRequest) {
  try {
    const user = await requireAuthenticatedUserFromRequest(request);
    const payload = (await request.json()) as ChoicePayload;
    const mode = String(payload.mode ?? "").trim().toLowerCase();

    if (mode !== "resume" && mode !== "restart") {
      return NextResponse.json({ error: "mode non valido" }, { status: 400 });
    }

    const state = await applyOnboardingChoice(user.id, mode);
    return NextResponse.json({
      data: state,
      meta: {
        nextPath: stepToPath(state.currentStep),
      },
    });
  } catch (error) {
    if (error instanceof AuthRequiredError) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    return NextResponse.json({ error: error instanceof Error ? error.message : "Errore interno" }, { status: 500 });
  }
}
