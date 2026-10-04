import { NextRequest, NextResponse } from "next/server";
import { requireAuthenticatedUserFromRequest } from "@/lib/auth/current-user";
import { withApiErrors } from "@/lib/http/errors";
import { resumeOnboarding } from "@/lib/onboarding/progress";
import { stepToPath } from "@/lib/onboarding/constants";

export const POST = withApiErrors(async (request: NextRequest) => {
  const user = await requireAuthenticatedUserFromRequest(request);
  const state = await resumeOnboarding(user.id);
  return NextResponse.json({
    data: state,
    meta: { nextPath: stepToPath(state.currentStep) },
  });
});
