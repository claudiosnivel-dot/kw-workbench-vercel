export const ONBOARDING_STEP_ORDER = [
  "WELCOME",
  "PROJECT_CREATE",
  "PROJECT_TARGETING",
  "SECTION_CREATE",
  "SEEDS",
  "RUN",
  "REVIEW_EXPORT",
] as const;

export type OnboardingStepKey = (typeof ONBOARDING_STEP_ORDER)[number];

export const ONBOARDING_STATUS_VALUES = ["NEEDS_CHOICE", "IN_PROGRESS", "PAUSED", "COMPLETED"] as const;
export type OnboardingStatusKey = (typeof ONBOARDING_STATUS_VALUES)[number];

export const ONBOARDING_ENTRY_MODE_VALUES = ["NONE", "RESUME", "RESTART"] as const;
export type OnboardingEntryModeKey = (typeof ONBOARDING_ENTRY_MODE_VALUES)[number];

// Titoli, descrizioni ed etichette brevi dei passi stanno nei cataloghi (onboarding.steps.<STEP>, T-1303).
export const ONBOARDING_STEP_META: Record<
  OnboardingStepKey,
  {
    index: number;
    path: string;
  }
> = {
  WELCOME: {
    index: 1,
    path: "/onboarding/welcome",
  },
  PROJECT_CREATE: {
    index: 2,
    path: "/onboarding/project-create",
  },
  PROJECT_TARGETING: {
    index: 3,
    path: "/onboarding/project-targeting",
  },
  SECTION_CREATE: {
    index: 4,
    path: "/onboarding/section-create",
  },
  SEEDS: {
    index: 5,
    path: "/onboarding/seeds",
  },
  RUN: {
    index: 6,
    path: "/onboarding/run",
  },
  REVIEW_EXPORT: {
    index: 7,
    path: "/onboarding/review-export",
  },
};

export function stepToPath(step: OnboardingStepKey): string {
  return ONBOARDING_STEP_META[step].path;
}

/** Posizione del passo nel percorso (1 = WELCOME): confronta passi precedenti e successivi. */
export function stepIndex(step: OnboardingStepKey): number {
  return ONBOARDING_STEP_META[step].index;
}

export function pathToStep(pathname: string): OnboardingStepKey | null {
  const match = ONBOARDING_STEP_ORDER.find((step) => ONBOARDING_STEP_META[step].path === pathname);
  return match ?? null;
}

export function isOnboardingStep(value: string): value is OnboardingStepKey {
  return ONBOARDING_STEP_ORDER.includes(value as OnboardingStepKey);
}

export function isOnboardingStatus(value: string): value is OnboardingStatusKey {
  return ONBOARDING_STATUS_VALUES.includes(value as OnboardingStatusKey);
}

export const ONBOARDING_TOTAL_STEPS = ONBOARDING_STEP_ORDER.length;
