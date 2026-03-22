import {
  OnboardingEntryMode,
  OnboardingStatus,
  OnboardingStep,
  type AutocompleteProvider,
  type MetricsProvider,
} from "@prisma/client";
import {
  type OnboardingEntryModeKey,
  type OnboardingStatusKey,
  type OnboardingStepKey,
  stepToPath,
} from "@/lib/onboarding/constants";
import { prisma } from "@/lib/prisma";

type OnboardingProgressRow = {
  id: string;
  user_id: string;
  status: OnboardingStatus;
  current_step: OnboardingStep;
  entry_mode: OnboardingEntryMode;
  active_project_id: string | null;
  active_subproject_id: string | null;
  first_export_at: Date | null;
  completed_at: Date | null;
  created_at: Date;
  updated_at: Date;
};

export type OnboardingProjectSnapshot = {
  id: string;
  name: string;
  language_code: string;
  country_code: string;
  autocomplete_provider: AutocompleteProvider;
  metrics_provider: MetricsProvider;
  min_volume: number;
  exclude_brands: boolean;
  expand_alpha: boolean;
  expand_numeric: boolean;
  expand_patterns: boolean;
  auto_classification: boolean;
  scoring_profile: string;
};

export type OnboardingSubprojectSnapshot = {
  id: string;
  project_id: string;
  name: string;
  description: string | null;
  language_code_override: string | null;
  country_code_override: string | null;
  autocomplete_provider_override: AutocompleteProvider | null;
  metrics_provider_override: MetricsProvider | null;
  min_volume_override: number | null;
  exclude_brands_override: boolean | null;
  expand_alpha_override: boolean | null;
  expand_numeric_override: boolean | null;
  expand_patterns_override: boolean | null;
  auto_classification_override: boolean | null;
  scoring_profile_override: string | null;
};

export type OnboardingState = {
  status: OnboardingStatusKey;
  currentStep: OnboardingStepKey;
  entryMode: OnboardingEntryModeKey;
  recommendedStep: OnboardingStepKey;
  hasExistingData: boolean;
  activeProjectId: string | null;
  activeSubprojectId: string | null;
  seedCount: number;
  jobCount: number;
  firstExportAt: string | null;
  completedAt: string | null;
  activeProject: OnboardingProjectSnapshot | null;
  activeSubproject: OnboardingSubprojectSnapshot | null;
};

type PatchInput = {
  currentStep?: OnboardingStepKey;
  status?: OnboardingStatusKey;
  entryMode?: OnboardingEntryModeKey;
  activeProjectId?: string | null;
  activeSubprojectId?: string | null;
};

const PROJECT_SELECT = {
  id: true,
  name: true,
  language_code: true,
  country_code: true,
  autocomplete_provider: true,
  metrics_provider: true,
  min_volume: true,
  exclude_brands: true,
  expand_alpha: true,
  expand_numeric: true,
  expand_patterns: true,
  auto_classification: true,
  scoring_profile: true,
} as const;

const SUBPROJECT_SELECT = {
  id: true,
  project_id: true,
  name: true,
  description: true,
  language_code_override: true,
  country_code_override: true,
  autocomplete_provider_override: true,
  metrics_provider_override: true,
  min_volume_override: true,
  exclude_brands_override: true,
  expand_alpha_override: true,
  expand_numeric_override: true,
  expand_patterns_override: true,
  auto_classification_override: true,
  scoring_profile_override: true,
} as const;

function mapProgress(row: OnboardingProgressRow): {
  status: OnboardingStatusKey;
  currentStep: OnboardingStepKey;
  entryMode: OnboardingEntryModeKey;
  firstExportAt: string | null;
  completedAt: string | null;
  activeProjectId: string | null;
  activeSubprojectId: string | null;
} {
  return {
    status: row.status,
    currentStep: row.current_step,
    entryMode: row.entry_mode,
    firstExportAt: row.first_export_at ? row.first_export_at.toISOString() : null,
    completedAt: row.completed_at ? row.completed_at.toISOString() : null,
    activeProjectId: row.active_project_id,
    activeSubprojectId: row.active_subproject_id,
  };
}

async function ensureProgressRow(userId: string): Promise<OnboardingProgressRow> {
  const row = await prisma.userOnboardingProgress.upsert({
    where: { user_id: userId },
    create: { user_id: userId },
    update: {},
    select: {
      id: true,
      user_id: true,
      status: true,
      current_step: true,
      entry_mode: true,
      active_project_id: true,
      active_subproject_id: true,
      first_export_at: true,
      completed_at: true,
      created_at: true,
      updated_at: true,
    },
  });

  return row;
}

async function findOwnedProject(userId: string, projectId: string) {
  return prisma.project.findFirst({
    where: {
      id: projectId,
      owner_user_id: userId,
    },
    select: PROJECT_SELECT,
  });
}

async function findFallbackProject(userId: string) {
  return prisma.project.findFirst({
    where: {
      owner_user_id: userId,
    },
    orderBy: [{ updated_at: "desc" }, { created_at: "desc" }],
    select: PROJECT_SELECT,
  });
}

async function findOwnedSubproject(userId: string, subprojectId: string, projectId?: string | null) {
  return prisma.subproject.findFirst({
    where: {
      id: subprojectId,
      ...(projectId ? { project_id: projectId } : {}),
      project: {
        owner_user_id: userId,
      },
    },
    select: SUBPROJECT_SELECT,
  });
}

async function findFallbackSubproject(projectId: string) {
  return prisma.subproject.findFirst({
    where: { project_id: projectId },
    orderBy: [{ position: "asc" }, { created_at: "asc" }],
    select: SUBPROJECT_SELECT,
  });
}

async function computeState(userId: string, row: OnboardingProgressRow): Promise<OnboardingState> {
  const hasExistingData = (await prisma.project.count({ where: { owner_user_id: userId } })) > 0;

  let activeProject = row.active_project_id ? await findOwnedProject(userId, row.active_project_id) : null;
  if (!activeProject) {
    activeProject = await findFallbackProject(userId);
  }

  let activeSubproject =
    row.active_subproject_id && activeProject
      ? await findOwnedSubproject(userId, row.active_subproject_id, activeProject.id)
      : null;

  if (!activeSubproject && activeProject) {
    activeSubproject = await findFallbackSubproject(activeProject.id);
  }

  const seedCount = activeSubproject
    ? await prisma.seed.count({
        where: {
          project_id: activeSubproject.project_id,
          subproject_id: activeSubproject.id,
        },
      })
    : 0;

  const jobCount = activeSubproject
    ? await prisma.job.count({
        where: {
          project_id: activeSubproject.project_id,
          subproject_id: activeSubproject.id,
        },
      })
    : 0;

  const recommendedStep = resolveRecommendedStep({
    activeProject: Boolean(activeProject),
    activeSubproject: Boolean(activeSubproject),
    seedCount,
    jobCount,
    hasExport: Boolean(row.first_export_at),
  });

  const updates: Record<string, string | null> = {};
  if ((row.active_project_id ?? null) !== (activeProject?.id ?? null)) {
    updates.active_project_id = activeProject?.id ?? null;
  }
  if ((row.active_subproject_id ?? null) !== (activeSubproject?.id ?? null)) {
    updates.active_subproject_id = activeSubproject?.id ?? null;
  }

  if (Object.keys(updates).length > 0) {
    await prisma.userOnboardingProgress.update({
      where: { id: row.id },
      data: updates,
    });
  }

  return {
    ...mapProgress(row),
    recommendedStep,
    hasExistingData,
    activeProjectId: activeProject?.id ?? null,
    activeSubprojectId: activeSubproject?.id ?? null,
    seedCount,
    jobCount,
    activeProject: activeProject,
    activeSubproject: activeSubproject,
  };
}

function resolveRecommendedStep(input: {
  activeProject: boolean;
  activeSubproject: boolean;
  seedCount: number;
  jobCount: number;
  hasExport: boolean;
}): OnboardingStepKey {
  if (!input.activeProject) {
    return "PROJECT_CREATE";
  }

  if (!input.activeSubproject) {
    return "SECTION_CREATE";
  }

  if (input.seedCount === 0) {
    return "SEEDS";
  }

  if (input.jobCount === 0) {
    return "RUN";
  }

  return "REVIEW_EXPORT";
}

export async function getOnboardingStateForUser(userId: string): Promise<OnboardingState> {
  const row = await ensureProgressRow(userId);
  return computeState(userId, row);
}

export function shouldRedirectUserToOnboarding(status: OnboardingStatusKey): boolean {
  return status === "NEEDS_CHOICE" || status === "IN_PROGRESS";
}

export function resolveOnboardingPathForState(state: OnboardingState): string {
  if (state.status === "COMPLETED") {
    return "/";
  }

  if (state.status === "NEEDS_CHOICE") {
    return stepToPath("WELCOME");
  }

  return stepToPath(state.currentStep);
}

export async function applyOnboardingChoice(userId: string, mode: "resume" | "restart"): Promise<OnboardingState> {
  const current = await getOnboardingStateForUser(userId);
  const now = new Date();

  if (mode === "resume") {
    await prisma.userOnboardingProgress.update({
      where: { user_id: userId },
      data: {
        status: OnboardingStatus.IN_PROGRESS,
        entry_mode: OnboardingEntryMode.RESUME,
        current_step: current.recommendedStep as OnboardingStep,
        active_project_id: current.activeProjectId,
        active_subproject_id: current.activeSubprojectId,
        completed_at: null,
      },
    });
  } else {
    await prisma.userOnboardingProgress.update({
      where: { user_id: userId },
      data: {
        status: OnboardingStatus.IN_PROGRESS,
        entry_mode: OnboardingEntryMode.RESTART,
        current_step: OnboardingStep.PROJECT_CREATE,
        active_project_id: null,
        active_subproject_id: null,
        first_export_at: null,
        completed_at: null,
        updated_at: now,
      },
    });
  }

  return getOnboardingStateForUser(userId);
}

async function validateActiveProjectId(userId: string, projectId: string): Promise<string> {
  const owned = await findOwnedProject(userId, projectId);
  if (!owned) {
    throw new Error("Progetto onboarding non valido");
  }

  return owned.id;
}

async function validateActiveSubprojectId(userId: string, subprojectId: string, projectId: string | null): Promise<{ id: string; project_id: string }> {
  const owned = await findOwnedSubproject(userId, subprojectId, projectId ?? undefined);
  if (!owned) {
    throw new Error("Sezione onboarding non valida");
  }

  return { id: owned.id, project_id: owned.project_id };
}

export async function patchOnboardingState(userId: string, input: PatchInput): Promise<OnboardingState> {
  const row = await ensureProgressRow(userId);

  const data: {
    current_step?: OnboardingStep;
    status?: OnboardingStatus;
    entry_mode?: OnboardingEntryMode;
    active_project_id?: string | null;
    active_subproject_id?: string | null;
    completed_at?: Date | null;
    first_export_at?: Date | null;
  } = {};

  let effectiveProjectId = row.active_project_id;

  if (input.activeProjectId !== undefined) {
    if (input.activeProjectId) {
      effectiveProjectId = await validateActiveProjectId(userId, input.activeProjectId);
      data.active_project_id = effectiveProjectId;
    } else {
      effectiveProjectId = null;
      data.active_project_id = null;
      data.active_subproject_id = null;
    }
  }

  if (input.activeSubprojectId !== undefined) {
    if (input.activeSubprojectId) {
      const validatedSubproject = await validateActiveSubprojectId(userId, input.activeSubprojectId, effectiveProjectId ?? null);
      if (!effectiveProjectId) {
        effectiveProjectId = validatedSubproject.project_id;
        data.active_project_id = validatedSubproject.project_id;
      }
      data.active_subproject_id = validatedSubproject.id;
    } else {
      data.active_subproject_id = null;
    }
  }

  if (input.currentStep) {
    data.current_step = input.currentStep as OnboardingStep;
    if (!input.status) {
      data.status = OnboardingStatus.IN_PROGRESS;
    }
  }

  if (input.entryMode) {
    data.entry_mode = input.entryMode as OnboardingEntryMode;
  }

  if (input.status) {
    data.status = input.status as OnboardingStatus;
    if (input.status === "COMPLETED") {
      const now = new Date();
      data.completed_at = now;
      if (!row.first_export_at) {
        data.first_export_at = now;
      }
    }

    if (input.status !== "COMPLETED") {
      data.completed_at = null;
    }
  }

  if (Object.keys(data).length === 0) {
    return getOnboardingStateForUser(userId);
  }

  await prisma.userOnboardingProgress.update({
    where: { user_id: userId },
    data,
  });

  return getOnboardingStateForUser(userId);
}

export async function skipOnboarding(userId: string): Promise<OnboardingState> {
  await prisma.userOnboardingProgress.update({
    where: { user_id: userId },
    data: { status: OnboardingStatus.PAUSED },
  });

  return getOnboardingStateForUser(userId);
}

export async function resumeOnboarding(userId: string): Promise<OnboardingState> {
  const state = await getOnboardingStateForUser(userId);
  if (state.status === "COMPLETED") {
    return state;
  }

  const nextStep = state.currentStep === "WELCOME" ? state.recommendedStep : state.currentStep;

  await prisma.userOnboardingProgress.update({
    where: { user_id: userId },
    data: {
      status: OnboardingStatus.IN_PROGRESS,
      current_step: nextStep as OnboardingStep,
      active_project_id: state.activeProjectId,
      active_subproject_id: state.activeSubprojectId,
    },
  });

  return getOnboardingStateForUser(userId);
}

export async function markOnboardingExportCompleted(userId: string): Promise<void> {
  const now = new Date();
  const existing = await prisma.userOnboardingProgress.findUnique({
    where: { user_id: userId },
    select: { first_export_at: true },
  });

  await prisma.userOnboardingProgress.upsert({
    where: { user_id: userId },
    create: {
      user_id: userId,
      status: OnboardingStatus.COMPLETED,
      current_step: OnboardingStep.REVIEW_EXPORT,
      entry_mode: OnboardingEntryMode.RESUME,
      first_export_at: now,
      completed_at: now,
    },
    update: {
      status: OnboardingStatus.COMPLETED,
      current_step: OnboardingStep.REVIEW_EXPORT,
      completed_at: now,
      first_export_at: existing?.first_export_at ?? now,
    },
  });
}
