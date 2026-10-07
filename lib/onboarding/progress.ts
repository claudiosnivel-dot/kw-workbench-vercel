import { projectAccessWhere } from "@/lib/authz/workspace";
import { OnboardingEntryMode, OnboardingStatus, OnboardingStep } from "@/lib/generated/prisma/enums";
import {
  type OnboardingEntryModeKey,
  type OnboardingStatusKey,
  type OnboardingStepKey,
  stepToPath,
} from "@/lib/onboarding/constants";
import { AppError, ValidationError } from "@/lib/http/errors";
import { missingPrecondition } from "@/lib/onboarding/preconditions";
import type { OnboardingProjectSnapshot, OnboardingSubprojectSnapshot } from "@/lib/onboarding/types";
import { prisma } from "@/lib/prisma";

export type { OnboardingProjectSnapshot, OnboardingSubprojectSnapshot } from "@/lib/onboarding/types";

type OnboardingProgressRow = {
  status: OnboardingStatus;
  current_step: OnboardingStep;
  entry_mode: OnboardingEntryMode;
  active_project_id: string | null;
  active_subproject_id: string | null;
  first_export_at: Date | null;
  completed_at: Date | null;
};

const PROGRESS_SELECT = {
  status: true,
  current_step: true,
  entry_mode: true,
  active_project_id: true,
  active_subproject_id: true,
  first_export_at: true,
  completed_at: true,
} as const;

// Stato di chi non ha ancora una riga: la lettura non la crea, nasce solo nelle mutazioni (T-1004).
const NO_PROGRESS_ROW: OnboardingProgressRow = {
  status: OnboardingStatus.NEEDS_CHOICE,
  current_step: OnboardingStep.WELCOME,
  entry_mode: OnboardingEntryMode.NONE,
  active_project_id: null,
  active_subproject_id: null,
  first_export_at: null,
  completed_at: null,
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

/** Riga di progress per le mutazioni (choice, resume, PATCH): la crea se manca. */
async function ensureProgressRow(userId: string): Promise<OnboardingProgressRow> {
  return prisma.userOnboardingProgress.upsert({
    where: { user_id: userId },
    create: { user_id: userId },
    update: {},
    select: PROGRESS_SELECT,
  });
}

// Progetti e sezioni dell'onboarding limitati ai workspace dell'utente (T-1502): un active_project_id fuori perimetro
// non si trova e viene ignorato.
async function findOwnedProject(userId: string, projectId: string) {
  return prisma.project.findFirst({
    where: {
      id: projectId,
      ...projectAccessWhere(userId),
    },
    select: PROJECT_SELECT,
  });
}

async function findFallbackProject(userId: string) {
  return prisma.project.findFirst({
    where: projectAccessWhere(userId),
    orderBy: [{ updated_at: "desc" }, { created_at: "desc" }],
    select: PROJECT_SELECT,
  });
}

async function findOwnedSubproject(userId: string, subprojectId: string, projectId?: string | null) {
  return prisma.subproject.findFirst({
    where: {
      id: subprojectId,
      ...(projectId ? { project_id: projectId } : {}),
      project: projectAccessWhere(userId),
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

/**
 * Stato calcolato senza scritture (T-1004): progetto e sezione attivi (con il fallback del progetto più recente e
 * della prima sezione) restano nel risultato; la riga si riconcilia solo nelle mutazioni (choice, resume).
 */
async function computeState(userId: string, row: OnboardingProgressRow): Promise<OnboardingState> {
  let activeProject = row.active_project_id ? await findOwnedProject(userId, row.active_project_id) : null;
  // Dopo «Ricomincia» il progetto più recente non si riadotta: si riparte da PROJECT_CREATE (T-1002).
  const restartedFromScratch = row.entry_mode === OnboardingEntryMode.RESTART && !row.active_project_id;
  if (!activeProject && !restartedFromScratch) {
    activeProject = await findFallbackProject(userId);
  }

  let activeSubproject =
    row.active_subproject_id && activeProject
      ? await findOwnedSubproject(userId, row.active_subproject_id, activeProject.id)
      : null;

  if (!activeSubproject && activeProject) {
    activeSubproject = await findFallbackSubproject(activeProject.id);
  }

  const sectionWhere = activeSubproject
    ? { project_id: activeSubproject.project_id, subproject_id: activeSubproject.id }
    : null;
  // Conteggi indipendenti in parallelo.
  const [projectCount, seedCount, jobCount] = await Promise.all([
    prisma.project.count({ where: projectAccessWhere(userId) }),
    sectionWhere ? prisma.seed.count({ where: sectionWhere }) : 0,
    sectionWhere ? prisma.job.count({ where: sectionWhere }) : 0,
  ]);

  const recommendedStep = resolveRecommendedStep({
    activeProject: Boolean(activeProject),
    activeSubproject: Boolean(activeSubproject),
    seedCount,
    jobCount,
  });

  return {
    ...mapProgress(row),
    recommendedStep,
    hasExistingData: projectCount > 0,
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

/** Stato completo per le pagine dell'onboarding e GET /api/onboarding/state: solo letture (T-1004). */
export async function getOnboardingStateForUser(userId: string): Promise<OnboardingState> {
  const row = await prisma.userOnboardingProgress.findUnique({ where: { user_id: userId }, select: PROGRESS_SELECT });
  return computeState(userId, row ?? NO_PROGRESS_ROW);
}

/** Solo lo status, con una query e nessuna scrittura (dashboard, T-1004): senza riga vale NEEDS_CHOICE. */
export async function getOnboardingStatusForUser(userId: string): Promise<OnboardingStatusKey> {
  const row = await prisma.userOnboardingProgress.findUnique({ where: { user_id: userId }, select: { status: true } });
  return row?.status ?? OnboardingStatus.NEEDS_CHOICE;
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
  await ensureProgressRow(userId);
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
    throw new ValidationError("Progetto onboarding non valido");
  }

  return owned.id;
}

async function validateActiveSubprojectId(userId: string, subprojectId: string, projectId: string | null): Promise<{ id: string; project_id: string }> {
  const owned = await findOwnedSubproject(userId, subprojectId, projectId ?? undefined);
  if (!owned) {
    throw new ValidationError("Sezione onboarding non valida");
  }

  return { id: owned.id, project_id: owned.project_id };
}

/**
 * PATCH dello stato dal client. Il completamento non si dichiara (arriva da un export reale, T-1003) e un passo
 * con precondizioni non soddisfatte sulla sezione attiva risultante viene rifiutato: in entrambi i casi nessuna
 * scrittura.
 */
export async function patchOnboardingState(userId: string, input: PatchInput): Promise<OnboardingState> {
  if (input.status === "COMPLETED") {
    throw new AppError(400, "ONBOARDING_STATUS_FORBIDDEN", "Il percorso guidato si completa con il primo export");
  }

  const row = await ensureProgressRow(userId);

  const data: {
    current_step?: OnboardingStep;
    status?: OnboardingStatus;
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
    const activeSubprojectId = data.active_subproject_id !== undefined ? data.active_subproject_id : row.active_subproject_id;
    const missing = await missingPrecondition(input.currentStep, activeSubprojectId);
    if (missing) {
      throw new AppError(409, "ONBOARDING_PRECONDITION", "Il passo richiesto non è ancora disponibile", { missing });
    }

    data.current_step = input.currentStep as OnboardingStep;
    if (!input.status) {
      data.status = OnboardingStatus.IN_PROGRESS;
    }
  }

  if (input.status) {
    data.status = input.status as OnboardingStatus;
    data.completed_at = null;
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
  await prisma.userOnboardingProgress.upsert({
    where: { user_id: userId },
    create: { user_id: userId, status: OnboardingStatus.PAUSED },
    update: { status: OnboardingStatus.PAUSED },
  });

  return getOnboardingStateForUser(userId);
}

export async function resumeOnboarding(userId: string): Promise<OnboardingState> {
  await ensureProgressRow(userId);
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

/**
 * Completa l'onboarding con un export reale (T-1003): solo se il progetto esportato è quello attivo del progress
 * e l'export ha almeno una riga. Senza riga di progress non c'è un progetto attivo, quindi nulla da completare.
 */
export async function markOnboardingExportCompleted(
  userId: string,
  exported: { projectId: string; exportedRows: number }
): Promise<void> {
  if (exported.exportedRows <= 0) {
    return;
  }

  const progress = await prisma.userOnboardingProgress.findUnique({
    where: { user_id: userId },
    select: { status: true, active_project_id: true, first_export_at: true },
  });
  if (!progress || progress.status === OnboardingStatus.COMPLETED || progress.active_project_id !== exported.projectId) {
    return;
  }

  const now = new Date();
  await prisma.userOnboardingProgress.update({
    where: { user_id: userId },
    data: {
      status: OnboardingStatus.COMPLETED,
      current_step: OnboardingStep.REVIEW_EXPORT,
      completed_at: now,
      first_export_at: progress.first_export_at ?? now,
    },
  });
}
