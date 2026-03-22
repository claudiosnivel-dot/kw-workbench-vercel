import { redirect } from "next/navigation";
import { requireAuthenticatedUserFromCookies } from "@/lib/auth/current-user";
import { resolveOnboardingPathForState, getOnboardingStateForUser } from "@/lib/onboarding/progress";

export const dynamic = "force-dynamic";

export default async function OnboardingEntryPage() {
  const user = await requireAuthenticatedUserFromCookies();
  const state = await getOnboardingStateForUser(user.id);
  redirect(resolveOnboardingPathForState(state));
}
