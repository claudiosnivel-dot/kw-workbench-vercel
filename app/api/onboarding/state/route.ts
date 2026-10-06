import { NextRequest, NextResponse } from "next/server";
import { requireAuthenticatedUserFromRequest } from "@/lib/auth/current-user";
import { AppError, withApiErrors } from "@/lib/http/errors";
import {
  type OnboardingStatusKey,
  type OnboardingStepKey,
  isOnboardingStatus,
  isOnboardingStep,
} from "@/lib/onboarding/constants";
import { getOnboardingStateForUser, patchOnboardingState } from "@/lib/onboarding/progress";

type PatchPayload = {
  currentStep?: unknown;
  status?: unknown;
  entryMode?: unknown;
  activeProjectId?: unknown;
  activeSubprojectId?: unknown;
};

function parseStringOrNull(raw: unknown): string | null | undefined {
  if (raw === undefined) {
    return undefined;
  }

  const value = String(raw ?? "").trim();
  return value ? value : null;
}

export const GET = withApiErrors(async (request: NextRequest) => {
  const user = await requireAuthenticatedUserFromRequest(request);
  const state = await getOnboardingStateForUser(user.id);
  return NextResponse.json({ data: state });
});

export const PATCH = withApiErrors(async (request: NextRequest) => {
  const user = await requireAuthenticatedUserFromRequest(request);
  const payload = (await request.json()) as PatchPayload;

  const currentStepRaw = payload.currentStep === undefined ? undefined : String(payload.currentStep).trim().toUpperCase();
  if (currentStepRaw && !isOnboardingStep(currentStepRaw)) {
    return NextResponse.json({ error: "currentStep non valido" }, { status: 400 });
  }
  const currentStep = currentStepRaw as OnboardingStepKey | undefined;

  const statusRaw = payload.status === undefined ? undefined : String(payload.status).trim().toUpperCase();
  if (statusRaw && !isOnboardingStatus(statusRaw)) {
    return NextResponse.json({ error: "status non valido" }, { status: 400 });
  }
  const status = statusRaw as OnboardingStatusKey | undefined;

  // La modalità d'ingresso la fissano la scelta e la ripresa dell'onboarding, non il PATCH dello stato (T-1101).
  if (payload.entryMode !== undefined) {
    throw new AppError(400, "ONBOARDING_ENTRY_MODE_FORBIDDEN", "La modalità del percorso guidato non si modifica da qui");
  }

  const state = await patchOnboardingState(user.id, {
    currentStep,
    status,
    activeProjectId: parseStringOrNull(payload.activeProjectId),
    activeSubprojectId: parseStringOrNull(payload.activeSubprojectId),
  });

  return NextResponse.json({ data: state });
});
