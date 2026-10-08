import { NextResponse } from "next/server";
import { requireRootAdminUserFromRequest } from "@/lib/auth/current-user";
import { getLaunchChecklist, getLaunchState, isLaunchStatus, setLaunchStatus } from "@/lib/billing/launch";
import { ValidationError, withApiErrors } from "@/lib/http/errors";

/** Stato e checklist del lancio commerciale (T-1606): solo il root admin; la checklist non contiene valori (CWE-200). */
export const GET = withApiErrors(async (request: Request) => {
  await requireRootAdminUserFromRequest(request);
  const state = await getLaunchState();
  return NextResponse.json({ data: { ...state, checklist: getLaunchChecklist() } });
});

/** Attiva o rimette in pausa il lancio (T-1606): live con la checklist incompleta → 409 LAUNCH_NOT_READY. */
export const PATCH = withApiErrors(async (request: Request) => {
  const actor = await requireRootAdminUserFromRequest(request);
  const { status } = (await request.json()) as { status?: unknown };
  if (!isLaunchStatus(status)) {
    throw new ValidationError("status deve valere live o paused");
  }
  const state = await setLaunchStatus(actor, status);
  return NextResponse.json({ data: { ...state, checklist: getLaunchChecklist() } });
});
