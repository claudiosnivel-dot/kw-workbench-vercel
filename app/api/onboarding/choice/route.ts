import { NextRequest, NextResponse } from "next/server";
import { requireAuthenticatedUserFromRequest } from "@/lib/auth/current-user";
import { errorResponse, withApiErrors } from "@/lib/http/errors";
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
    return errorResponse(400, "VALIDATION_ERROR", "mode non valido");
  }

  const state = await applyOnboardingChoice(user.id, mode);
  return NextResponse.json({
    data: state,
    meta: {
      nextPath: stepToPath(state.currentStep),
    },
  });
});
