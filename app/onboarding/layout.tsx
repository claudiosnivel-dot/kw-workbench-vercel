import { OnboardingProgressHeader } from "@/components/onboarding-progress-header";

export const dynamic = "force-dynamic";

export default function OnboardingLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="mx-auto flex w-full max-w-4xl flex-col gap-6">
      <OnboardingProgressHeader />
      {children}
    </div>
  );
}
