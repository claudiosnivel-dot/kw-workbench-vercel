import { projectAccessWhere } from "@/lib/authz/workspace";
import { assertWithinLimit, loadPlanGuard } from "@/lib/billing/enforce";
import { Prisma } from "@/lib/generated/prisma/client";
import { OnboardingIdempotencyKind, OnboardingStatus, OnboardingStep } from "@/lib/generated/prisma/enums";
import { AppError, NotFoundError } from "@/lib/http/errors";
import { touchProjectActivity } from "@/lib/modules/project-activity";
import { parseProjectCreate, parseSubprojectCreate } from "@/lib/modules/project-settings";
import { guardSectionName } from "@/lib/modules/sections";
import { stepToPath } from "@/lib/onboarding/constants";
import { prisma } from "@/lib/prisma";

const UUID_V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

type Actor = { id: string; isRootAdmin: boolean };

/** Esito di una creazione: 201 se creata ora, 200 se la chiave era già stata usata (stessi id, nessuna riga nuova). */
export type OnboardingCreation = {
  status: 200 | 201;
  projectId: string;
  subprojectId: string | null;
  nextPath: string;
};

/** La chiave è stata registrata da una richiesta concorrente: la transazione si annulla e vale l'esito salvato. */
class IdempotencyKeyTakenError extends Error {}

function parseIdempotencyKey(raw: unknown): string {
  if (typeof raw !== "string" || !UUID_V4.test(raw)) {
    throw new AppError(400, "INVALID_IDEMPOTENCY_KEY", "idempotencyKey deve essere un UUID v4");
  }
  return raw.toLowerCase();
}

/**
 * Esito già registrato per la chiave dell'utente, oppure null. La stessa chiave usata per un'altra creazione
 * (altro tipo o altro progetto) è un conflitto: non si restituiscono id di un'operazione diversa.
 */
async function storedCreation(
  userId: string,
  key: string,
  expected: { kind: OnboardingIdempotencyKind; projectId?: string; nextPath: string }
): Promise<OnboardingCreation | null> {
  const stored = await prisma.onboardingIdempotencyKey.findUnique({
    where: { user_id_key: { user_id: userId, key } },
    select: { kind: true, project_id: true, subproject_id: true },
  });
  if (!stored) {
    return null;
  }

  if (stored.kind !== expected.kind || (expected.projectId !== undefined && stored.project_id !== expected.projectId)) {
    throw new AppError(409, "IDEMPOTENCY_KEY_CONFLICT", "La chiave di idempotenza è già stata usata per un'altra operazione");
  }

  return { status: 200, projectId: stored.project_id, subprojectId: stored.subproject_id, nextPath: expected.nextPath };
}

/** Registra la chiave nella transazione della creazione; P2002 = stessa chiave registrata nel frattempo. */
async function storeKey(tx: Prisma.TransactionClient, data: Prisma.OnboardingIdempotencyKeyUncheckedCreateInput) {
  try {
    await tx.onboardingIdempotencyKey.create({ data });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      throw new IdempotencyKeyTakenError();
    }
    throw error;
  }
}

/** Avanza l'onboarding nella stessa transazione della creazione: la riga nasce qui se manca. */
function advanceProgress(
  tx: Prisma.TransactionClient,
  userId: string,
  data: { current_step: OnboardingStep; active_project_id: string; active_subproject_id: string | null }
) {
  const progress = { ...data, status: OnboardingStatus.IN_PROGRESS };
  return tx.userOnboardingProgress.upsert({
    where: { user_id: userId },
    create: { user_id: userId, ...progress },
    update: progress,
  });
}

/** Crea e, se una richiesta concorrente ha registrato la stessa chiave, restituisce il suo esito. */
async function createOnce(
  create: () => Promise<OnboardingCreation>,
  replay: () => Promise<OnboardingCreation | null>
): Promise<OnboardingCreation> {
  try {
    return await create();
  } catch (error) {
    const stored = error instanceof IdempotencyKeyTakenError ? await replay() : null;
    if (stored) {
      return stored;
    }
    throw error;
  }
}

/**
 * Passo 2 (T-1001): crea il progetto (senza sezione iniziale) nel workspace indicato, già autorizzato dalla rotta
 * (workspace attivo, T-1504), e porta l'onboarding a PROJECT_TARGETING in una sola transazione; la stessa chiave
 * restituisce lo stesso progetto.
 */
export async function createOnboardingProject(
  user: Actor,
  input: { name: unknown; idempotencyKey: unknown; workspaceId: string }
): Promise<OnboardingCreation> {
  const key = parseIdempotencyKey(input.idempotencyKey);
  const parsed = parseProjectCreate({ name: input.name, createInitialSection: false }, user);
  const nextPath = stepToPath("PROJECT_TARGETING");
  const replay = () => storedCreation(user.id, key, { kind: OnboardingIdempotencyKind.PROJECT, nextPath });

  return (
    (await replay()) ??
    createOnce(async () => {
      const plan = await loadPlanGuard(input.workspaceId);
      const projectId = await prisma.$transaction(async (tx) => {
        // Limite dei progetti del piano (T-1605), come POST /api/projects.
        await assertWithinLimit(tx, plan, "maxProjects", async () =>
          (await tx.project.count({ where: { workspace_id: input.workspaceId } })) + 1
        );
        const project = await tx.project.create({
          data: { workspace_id: input.workspaceId, created_by_user_id: user.id, ...parsed.data },
          select: { id: true },
        });
        await storeKey(tx, { user_id: user.id, key, kind: OnboardingIdempotencyKind.PROJECT, project_id: project.id });
        await advanceProgress(tx, user.id, {
          current_step: OnboardingStep.PROJECT_TARGETING,
          active_project_id: project.id,
          active_subproject_id: null,
        });
        return project.id;
      });
      return { status: 201, projectId, subprojectId: null, nextPath };
    }, replay)
  );
}

/**
 * Passo 4 (T-1001): crea la sezione in un progetto di un workspace dell'utente (position in coda, sezione predefinita
 * se assente, come POST /api/projects/[id]/subprojects) e porta l'onboarding a SEEDS in una sola transazione.
 * Nome già usato nel progetto -> 409 SECTION_NAME_TAKEN; progetto fuori dai workspace dell'utente -> 404 (T-1502).
 */
export async function createOnboardingSection(
  user: Actor,
  input: { projectId: unknown; name: unknown; idempotencyKey: unknown }
): Promise<OnboardingCreation> {
  const key = parseIdempotencyKey(input.idempotencyKey);
  const projectId = typeof input.projectId === "string" ? input.projectId.trim() : "";
  const parsed = parseSubprojectCreate({ name: input.name }, user);
  const nextPath = stepToPath("SEEDS");
  const replay = () => storedCreation(user.id, key, { kind: OnboardingIdempotencyKind.SECTION, projectId, nextPath });

  return (
    (await replay()) ??
    createOnce(async () => {
      const perimeter = projectAccessWhere(user.id, "section.write");
      // Diritti del workspace del progetto letti prima della transazione (T-1605); fuori dai workspace dell'utente → 404.
      const owner = await prisma.project.findFirst({ where: { id: projectId, ...perimeter }, select: { workspace_id: true } });
      if (!owner) {
        throw new NotFoundError("Progetto non trovato");
      }
      const plan = await loadPlanGuard(owner.workspace_id);
      const subprojectId = await guardSectionName(() =>
        prisma.$transaction(async (tx) => {
          const project = await tx.project.findFirst({
            where: { id: projectId, ...perimeter },
            select: { id: true, default_subproject_id: true },
          });
          if (!project) {
            throw new NotFoundError("Progetto non trovato");
          }
          const target = { id: project.id, perimeter };

          // Limite delle sezioni del piano (T-1605), come POST /api/projects/[id]/subprojects.
          await assertWithinLimit(tx, plan, "maxSectionsPerProject", async () =>
            (await tx.subproject.count({ where: { project_id: project.id } })) + 1
          );
          const position = await tx.subproject.count({ where: { project_id: project.id } });
          const section = await tx.subproject.create({
            data: { project_id: project.id, position, ...parsed.data },
            select: { id: true },
          });
          if (!project.default_subproject_id) {
            await tx.project.updateMany({ where: { id: project.id, ...perimeter }, data: { default_subproject_id: section.id } });
          }
          await storeKey(tx, {
            user_id: user.id,
            key,
            kind: OnboardingIdempotencyKind.SECTION,
            project_id: project.id,
            subproject_id: section.id,
          });
          await advanceProgress(tx, user.id, {
            current_step: OnboardingStep.SEEDS,
            active_project_id: project.id,
            active_subproject_id: section.id,
          });
          await touchProjectActivity(tx, target);
          return section.id;
        })
      );
      return { status: 201, projectId, subprojectId, nextPath };
    }, replay)
  );
}
