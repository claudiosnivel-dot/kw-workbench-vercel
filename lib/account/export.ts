import { textStream } from "@/lib/http/text-stream";
import { EXPORT_FIELD_SELECT } from "@/lib/modules/export";
import { prisma } from "@/lib/prisma";

const KEYWORD_BATCH_SIZE = 1_000;

/** JSON di un valore del DB: le colonne BigInt (offerte in micro) diventano stringhe. */
function json(value: unknown): string {
  return JSON.stringify(value, (_key, item: unknown) => (typeof item === "bigint" ? item.toString() : item));
}

/**
 * Workspace di cui l'utente è l'unico OWNER (T-1804): i loro dati sono suoi. Degli altri workspace (condivisi con un
 * altro OWNER o di altri) l'export riporta solo id, nome e ruolo.
 */
export async function soleOwnedWorkspaceIds(userId: string): Promise<string[]> {
  const rows = await prisma.membership.findMany({
    where: { user_id: userId, role: "OWNER", workspace: { memberships: { none: { role: "OWNER", user_id: { not: userId } } } } },
    select: { workspace_id: true },
    orderBy: { created_at: "asc" },
  });
  return rows.map((row) => row.workspace_id);
}

// Keyword dell'export dell'account: le colonne dell'export dei risultati (T-805) con id, precisione e data.
const KEYWORD_SELECT = { id: true, ...EXPORT_FIELD_SELECT, metrics_precision: true, created_at: true } as const;

/** Keyword di un progetto a blocchi in ordine di id, separate da virgole: nessun progetto intero in memoria. */
async function* keywordChunks(projectId: string): AsyncGenerator<string> {
  let cursor: string | null = null;
  let first = true;
  for (;;) {
    const batch: { id: string }[] = await prisma.keywordCandidate.findMany({
      where: { project_id: projectId },
      orderBy: { id: "asc" },
      take: KEYWORD_BATCH_SIZE,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
      select: KEYWORD_SELECT,
    });
    if (batch.length === 0) {
      return;
    }
    yield `${first ? "" : ","}${batch.map(json).join(",")}`;
    first = false;
    cursor = batch[batch.length - 1].id;
  }
}

/** Progetti di un workspace dell'utente con sezioni, seed e keyword. */
async function* projectChunks(workspaceId: string): AsyncGenerator<string> {
  const projects = await prisma.project.findMany({
    where: { workspace_id: workspaceId },
    orderBy: { created_at: "asc" },
    select: {
      id: true,
      name: true,
      language_code: true,
      country_code: true,
      created_at: true,
      subprojects: {
        orderBy: { position: "asc" },
        select: { id: true, name: true, description: true, created_at: true, seeds: { select: { keyword: true }, orderBy: { created_at: "asc" } } },
      },
    },
  });

  for (const [index, { subprojects, ...project }] of projects.entries()) {
    const sections = subprojects.map(({ seeds, ...section }) => ({ ...section, seeds: seeds.map((seed) => seed.keyword) }));
    yield `${index === 0 ? "" : ","}${json(project).slice(0, -1)},"sections":${json(sections)},"keyword_candidates":[`;
    yield* keywordChunks(project.id);
    yield "]}";
  }
}

/**
 * Corpo JSON dell'export dell'account (T-1804, GDPR): profilo, membership e, per i workspace di cui l'utente è unico
 * OWNER, abbonamento e progetti con sezioni, seed e keyword. Mai password_hash, session_version, token cifrati o hash
 * di verifica, reset e inviti, né dati di altri utenti (CWE-212); l'utente è solo quello della sessione (CWE-639).
 */
async function* accountExportChunks(userId: string): AsyncGenerator<string> {
  const [user, memberships, ownedIds] = await Promise.all([
    prisma.user.findUniqueOrThrow({
      where: { id: userId },
      select: {
        id: true,
        email: true,
        display_name: true,
        created_at: true,
        theme_mode: true,
        font_scale_mode: true,
        color_vision_mode: true,
        ui_locale: true,
        accepted_terms_version: true,
        accepted_terms_at: true,
      },
    }),
    prisma.membership.findMany({
      where: { user_id: userId },
      orderBy: { created_at: "asc" },
      select: { role: true, workspace: { select: { id: true, name: true } } },
    }),
    soleOwnedWorkspaceIds(userId),
  ]);
  const { theme_mode, font_scale_mode, color_vision_mode, ui_locale, ...identity } = user;
  const profile = { ...identity, preferences: { theme_mode, font_scale_mode, color_vision_mode, ui_locale } };
  const membershipRows = memberships.map((row) => ({ workspace_id: row.workspace.id, workspace_name: row.workspace.name, role: row.role }));

  yield `{"exported_at":${json(new Date())},"profile":${json(profile)},"memberships":${json(membershipRows)},"owned_workspaces":[`;
  for (const [index, workspaceId] of ownedIds.entries()) {
    const workspace = await prisma.workspace.findUniqueOrThrow({
      where: { id: workspaceId },
      select: {
        id: true,
        name: true,
        subscription: { select: { plan_id: true, status: true, current_period_start: true, current_period_end: true } },
      },
    });
    yield `${index === 0 ? "" : ","}${json(workspace).slice(0, -1)},"projects":[`;
    yield* projectChunks(workspaceId);
    yield "]}";
  }
  yield "]}";
}

export function accountExportStream(userId: string, onError: (error: unknown) => void): ReadableStream<Uint8Array> {
  return textStream(accountExportChunks(userId), onError);
}
