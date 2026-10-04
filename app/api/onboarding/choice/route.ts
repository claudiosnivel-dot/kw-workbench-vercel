import { NextRequest, NextResponse } from "next/server";
import { requireAuthenticatedUserFromRequest } from "@/lib/auth/current-user";
import { withApiErrors } from "@/lib/http/errors";
import { applyOnboardingChoice } from "@/lib/onboarding/progress";
import { stepToPath } from "@/lib/onboarding/constants";

type ChoicePayload = {
  mode?: unknown;
};

export const POST = withApiErrors(async (request: NextRequest) => {
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
});
