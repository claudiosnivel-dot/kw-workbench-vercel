import { z } from "zod";
import type { Prisma } from "@/lib/generated/prisma/client";
import { ValidationError } from "@/lib/http/errors";
import { type ActivityTarget, touchProjectActivity } from "@/lib/modules/project-activity";
import { buildResultsWhere, parseResultsFilters } from "@/lib/modules/results-filters";
import { prisma } from "@/lib/prisma";

export const MAX_BULK_IDS = 1000;

/** Azioni massive in whitelist: ciascuna scrive un solo campo noto (CWE-915). */
const BULK_ACTION_DATA = {
  approve: { review_status: "approved" },
  reject: { review_status: "rejected" },
  "mark-review": { review_status: "pending" },
  select: { selected_for_export: true },
  unselect: { selected_for_export: false },
} as const satisfies Record<string, Prisma.KeywordCandidateUpdateManyMutationInput>;

const bulkActionSchema = z
  .object({
    action: z.enum(Object.keys(BULK_ACTION_DATA) as [keyof typeof BULK_ACTION_DATA]),
    ids: z.array(z.string().trim().min(1)).min(1).max(MAX_BULK_IDS).optional(),
    filters: z.record(z.string(), z.string()).optional(),
    subprojectId: z.string().trim().nullish(),
  })
  .refine((payload) => (payload.ids === undefined) !== (payload.filters === undefined), {
    message: "Indicare esattamente uno tra ids e filters",
  });

export type BulkActionPayload = z.infer<typeof bulkActionSchema>;

/** Valida il body della PATCH dei risultati (T-803): ogni violazione è un 400. */
export function parseBulkActionPayload(body: unknown): BulkActionPayload {
  const parsed = bulkActionSchema.safeParse(body);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    const field = issue.path.length > 0 ? `${issue.path[0].toString()}: ` : "";
    throw new ValidationError(`Azione massiva non valida (${field}${issue.message})`);
  }
  return parsed.data;
}

/**
 * Applica l'azione alle righe indicate per id o all'intero set filtrato della vista. project è il progetto
 * autorizzato e subprojectId (se c'è) una sua sezione, già verificati dalla route: il where parte sempre da
 * project_id con il perimetro del workspace (T-1502) e i filtri passano da parseResultsFilters (enum in whitelist).
 * Id di righe di altri progetti non corrispondono: 0 righe aggiornate.
 */
export async function applyBulkAction(project: ActivityTarget, payload: BulkActionPayload): Promise<number> {
  const subprojectId = payload.subprojectId || null;
  const rows: Prisma.KeywordCandidateWhereInput = payload.filters
    ? buildResultsWhere(project.id, parseResultsFilters(payload.filters), subprojectId)
    : { project_id: project.id, id: { in: payload.ids }, ...(subprojectId ? { subproject_id: subprojectId } : {}) };

  return prisma.$transaction(async (tx) => {
    const { count } = await tx.keywordCandidate.updateMany({
      where: { AND: [rows, { project: project.perimeter }] },
      data: BULK_ACTION_DATA[payload.action],
    });
    await touchProjectActivity(tx, project);
    return count;
  });
}
