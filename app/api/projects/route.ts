import { Prisma } from "@/lib/generated/prisma/client";
import { NextRequest, NextResponse } from "next/server";
import { requireAuthenticatedUserFromRequest } from "@/lib/auth/current-user";
import { requireRequestWorkspace, requireWorkspaceRole } from "@/lib/authz/workspace";
import { assertLicensedMetricsChoice, assertWithinLimit, countLimitedProjects, loadPlanGuard } from "@/lib/billing/enforce";
import { withApiErrors } from "@/lib/http/errors";
import { parseProjectCreate } from "@/lib/modules/project-settings";
import { prisma } from "@/lib/prisma";

/** workspaceId facoltativo del body (T-1502), separato dai campi del progetto validati dallo schema strict. */
function splitWorkspaceId(payload: unknown): { workspaceId: unknown; fields: unknown } {
  if (!payload || typeof payload !== "object" || Array.isArray(payload) || !("workspaceId" in payload)) {
    return { workspaceId: undefined, fields: payload };
  }
  const { workspaceId, ...fields } = payload as Record<string, unknown>;
  return { workspaceId, fields };
}

/**
 * Nuovo progetto (T-1502, T-1504): nel workspace di workspaceId se indicato (membro con project.create, altrimenti 404
 * WORKSPACE_NOT_FOUND), altrimenti nel workspace attivo del cookie kwb_workspace riverificato; l'autore è l'utente.
 * Limiti del piano (T-1605): progetti del workspace (escluso quello dell'onboarding, T-2004), sezione iniziale e sue
 * seed, metriche con licenza; i conteggi stanno nella transazione della scrittura, sotto il lock del workspace.
 */
export const POST = withApiErrors(async (request: NextRequest) => {
  const user = await requireAuthenticatedUserFromRequest(request);

  const { workspaceId, fields } = splitWorkspaceId(await request.json());
  const input = parseProjectCreate(fields, user);
  const workspace =
    workspaceId === undefined
      ? await requireRequestWorkspace(user, request, "project.create")
      : await requireWorkspaceRole(user, workspaceId, "project.create");

  await assertLicensedMetricsChoice(user, workspace.id, input.data.metrics_provider, undefined);
  const plan = await loadPlanGuard(workspace.id);

  const result = await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
    await assertWithinLimit(tx, plan, "maxProjects", async () => (await countLimitedProjects(tx, workspace.id)) + 1);
    if (input.createInitialSection) {
      await assertWithinLimit(tx, plan, "maxSectionsPerProject", () => 1);
      await assertWithinLimit(tx, plan, "maxSeedsPerSection", () => input.seeds.length);
    }

    const created = await tx.project.create({
      data: { workspace_id: workspace.id, created_by_user_id: user.id, ...input.data },
    });

    let initialSubprojectId: string | null = null;

    if (input.createInitialSection) {
      const initialSubproject = await tx.subproject.create({
        data: {
          project_id: created.id,
          name: input.initialSubprojectName,
          position: 0,
        },
      });

      initialSubprojectId = initialSubproject.id;

      await tx.project.updateMany({
        where: { id: created.id, workspace_id: workspace.id },
        data: { default_subproject_id: initialSubproject.id },
      });

      if (input.seeds.length > 0) {
        await tx.seed.createMany({
          data: input.seeds.map((keyword) => ({
            project_id: created.id,
            subproject_id: initialSubproject.id,
            keyword,
          })),
        });
      }
    }

    return {
      project: created,
      initial_subproject_id: initialSubprojectId,
    };
  });

  return NextResponse.json({ data: result }, { status: 201 });
});
