import { NextRequest, NextResponse } from "next/server";
import { requireAuthenticatedUserFromRequest } from "@/lib/auth/current-user";
import { withApiErrors } from "@/lib/http/errors";
import { skipOnboarding } from "@/lib/onboarding/progress";

export const POST = withApiErrors(async (request: NextRequest) => {
  const user = await requireAuthenticatedUserFromRequest(request);
  const state = await skipOnboarding(user.id);
  return NextResponse.json({ data: state, meta: { nextPath: "/" } });
});
