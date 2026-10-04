import { redirect } from "next/navigation";
import { requirePageUser } from "@/lib/auth/page-guard";
import { resolveOnboardingPathForState, getOnboardingStateForUser } from "@/lib/onboarding/progress";

export const dynamic = "force-dynamic";

export default async function OnboardingEntryPage() {
  const user = await requirePageUser();
  const state = await getOnboardingStateForUser(user.id);
  redirect(resolveOnboardingPathForState(state));
}
