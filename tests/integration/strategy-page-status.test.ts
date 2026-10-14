// Gate di T-2501 (AC-2501-1, AC-2501-3): lo stato di scrittura di una pagina del piano cambia con la PATCH della
// pagina, sotto il controllo della version, senza toccare i titoli; fuori dal workspace la risposta è 404.
import { randomUUID } from "node:crypto";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { PATCH as patchPage } from "@/app/api/projects/[id]/strategies/[strategyId]/pages/[pageId]/route";
import { prisma } from "@/lib/prisma";
import { createUserWithSession } from "../helpers/auth";
import { resetDatabase } from "../helpers/db";
import { callRoute } from "../helpers/http";
import { insertStrategy } from "../helpers/strategy";

type Session = Awaited<ReturnType<typeof createUserWithSession>>;

beforeAll(() => {
  vi.stubEnv("APP_AUTH_ENABLED", "true");
});

beforeEach(async () => {
  await resetDatabase();
});

async function ownerPlan(version: number) {
  const owner = await createUserWithSession({ displayName: `t2501-${randomUUID().slice(0, 8)}` });
  const project = await prisma.project.create({ data: { name: "Piano", workspace_id: owner.workspaceId, language_code: "it" } });
  const plan = await insertStrategy({
    projectId: project.id,
    version,
    pages: [
      { key: "hub", kind: "HUB", keywords: [{ text: "scarpe running", volume: 9900 }] },
      { key: "spoke", kind: "SPOKE", hub: "hub", keywords: [{ text: "scarpe running donna", volume: 2100 }] },
    ],
  });
  return { owner, projectId: project.id, ...plan };
}

function sendPatch(session: Session, projectId: string, strategyId: string, pageId: string, body: unknown) {
  return callRoute(patchPage, {
    method: "PATCH",
    url: `/api/projects/${projectId}/strategies/${strategyId}/pages/${pageId}`,
    cookie: session.cookie,
    params: { id: projectId, strategyId, pageId },
    body,
  });
}

const pageRow = (id: string) =>
  prisma.strategyPage.findUniqueOrThrow({ where: { id }, select: { status: true, status_changed_at: true, h1_edited: true, h2_edited: true } });

describe("stato di scrittura delle pagine del piano", () => {
  // covers: AC-2501-1
  it("la PATCH con status WRITING cambia lo stato e la version, uno stato sconosciuto è 400 e la pagina resta WRITING", async () => {
    const { owner, projectId, strategyId, pageIds } = await ownerPlan(2);

    const first = await sendPatch(owner, projectId, strategyId, pageIds.spoke, { version: 2, status: "WRITING" });
    const afterFirst = await pageRow(pageIds.spoke);
    const second = await sendPatch(owner, projectId, strategyId, pageIds.spoke, { version: 3, status: "DONE" });

    expect(first.status).toBe(200);
    expect(afterFirst.status).toBe("WRITING");
    expect(afterFirst.status_changed_at).toBeInstanceOf(Date);
    expect(afterFirst.h1_edited).toBe(false);
    expect((await prisma.strategy.findUniqueOrThrow({ where: { id: strategyId }, select: { version: true } })).version).toBe(3);
    expect(second.status).toBe(400);
    expect(((await second.json()) as { code: string }).code).toBe("VALIDATION_ERROR");
    expect((await pageRow(pageIds.spoke)).status).toBe("WRITING");
  });

  // covers: AC-2501-3
  it("un utente di un altro workspace riceve 404 e lo stato della pagina non cambia", async () => {
    const { projectId, strategyId, pageIds } = await ownerPlan(0);
    const stranger = await createUserWithSession({ displayName: `t2501-other-${randomUUID().slice(0, 8)}` });

    const response = await sendPatch(stranger, projectId, strategyId, pageIds.spoke, { version: 0, status: "PUBLISHED" });

    expect(response.status).toBe(404);
    expect((await pageRow(pageIds.spoke)).status).toBe("TODO");
  });
});
