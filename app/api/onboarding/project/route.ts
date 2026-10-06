import { NextRequest, NextResponse } from "next/server";
import { requireAuthenticatedUserFromRequest } from "@/lib/auth/current-user";
import { withApiErrors } from "@/lib/http/errors";
import { createOnboardingProject } from "@/lib/onboarding/create";

type ProjectPayload = { name?: unknown; idempotencyKey?: unknown } | null;

// Passo 2 dell'onboarding (T-1001): progetto e avanzamento in una transazione, idempotente per chiave.
export const POST = withApiErrors(async (request: NextRequest) => {
  const user = await requireAuthenticatedUserFromRequest(request);
  const payload = (await request.json()) as ProjectPayload;
  const created = await createOnboardingProject(user, { name: payload?.name, idempotencyKey: payload?.idempotencyKey });
  return NextResponse.json(
    { data: { projectId: created.projectId, nextPath: created.nextPath } },
    { status: created.status }
  );
});
