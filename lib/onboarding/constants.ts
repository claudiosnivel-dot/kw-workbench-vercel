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

export const ONBOARDING_STEP_META: Record<
  OnboardingStepKey,
  {
    index: number;
    path: string;
    shortLabel: string;
    title: string;
    description: string;
  }
> = {
  WELCOME: {
    index: 1,
    path: "/onboarding/welcome",
    shortLabel: "Start",
    title: "Benvenuto nel percorso guidato",
    description: "Scegli se riprendere dai dati esistenti o ricominciare il percorso.",
  },
  PROJECT_CREATE: {
    index: 2,
    path: "/onboarding/project-create",
    shortLabel: "Progetto",
    title: "Crea il progetto padre",
    description: "Crea il contenitore principale su cui lavorerai nel wizard.",
  },
  PROJECT_TARGETING: {
    index: 3,
    path: "/onboarding/project-targeting",
    shortLabel: "Targeting",
    title: "Configura lingua e paese",
    description: "Imposta il targeting base che guidera l'estrazione autocomplete.",
  },
  SECTION_CREATE: {
    index: 4,
    path: "/onboarding/section-create",
    shortLabel: "Sezione",
    title: "Crea la prima sezione",
    description: "Definisci la sezione operativa in cui lancerai la prima estrazione.",
  },
  SEEDS: {
    index: 5,
    path: "/onboarding/seeds",
    shortLabel: "Seed",
    title: "Inserisci le keyword seed",
    description: "Aggiungi le seed iniziali della sezione per preparare il primo job.",
  },
  RUN: {
    index: 6,
    path: "/onboarding/run",
    shortLabel: "Run",
    title: "Avvia la prima estrazione",
    description: "Esegui un job reale sulla sezione attiva e verifica il risultato.",
  },
  REVIEW_EXPORT: {
    index: 7,
    path: "/onboarding/review-export",
    shortLabel: "Export",
    title: "Rivedi e fai il primo export",
    description: "Revisione consigliata, poi esporta in qualsiasi formato per completare il percorso.",
  },
};

export function stepToPath(step: OnboardingStepKey): string {
  return ONBOARDING_STEP_META[step].path;
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

export function isOnboardingEntryMode(value: string): value is OnboardingEntryModeKey {
  return ONBOARDING_ENTRY_MODE_VALUES.includes(value as OnboardingEntryModeKey);
}

export const ONBOARDING_TOTAL_STEPS = ONBOARDING_STEP_ORDER.length;
