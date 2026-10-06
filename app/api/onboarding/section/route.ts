import { NextRequest, NextResponse } from "next/server";
import { requireAuthenticatedUserFromRequest } from "@/lib/auth/current-user";
import { withApiErrors } from "@/lib/http/errors";
import { createOnboardingSection } from "@/lib/onboarding/create";

type SectionPayload = { projectId?: unknown; name?: unknown; idempotencyKey?: unknown } | null;

// Passo 4 dell'onboarding (T-1001): sezione e avanzamento in una transazione, idempotente per chiave.
export const POST = withApiErrors(async (request: NextRequest) => {
  const user = await requireAuthenticatedUserFromRequest(request);
  const payload = (await request.json()) as SectionPayload;
  const created = await createOnboardingSection(user, {
    projectId: payload?.projectId,
    name: payload?.name,
    idempotencyKey: payload?.idempotencyKey,
  });
  return NextResponse.json(
    { data: { subprojectId: created.subprojectId, nextPath: created.nextPath } },
    { status: created.status }
  );
});
