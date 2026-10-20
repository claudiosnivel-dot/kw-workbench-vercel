// Gate di T-4502 (AC-4502-2): «Segna come pubblicata» invia la PATCH della pagina del piano con status PUBLISHED e
// l'indirizzo della pagina; un indirizzo che non è https assoluto è 400 VALIDATION_ERROR e la pagina resta com'era. In
// più l'indirizzo che si cambia in seguito e «Rigenera» che lo porta sulla copia della pagina.
import { randomUUID } from "node:crypto";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { PATCH as patchPage } from "@/app/api/projects/[id]/strategies/[strategyId]/pages/[pageId]/route";
import { POST as generate } from "@/app/api/projects/[id]/strategies/route";
import { prisma } from "@/lib/prisma";
import { memberWithPlan, type PlanPage, type Session, strategyVersion } from "../helpers/ai-titles";
import { resetDatabase } from "../helpers/db";
import { callRoute } from "../helpers/http";

beforeAll(() => {
  vi.stubEnv("APP_AUTH_ENABLED", "true");
});

beforeEach(async () => {
  await resetDatabase();
});

const sendPatch = (session: Session, page: PlanPage, body: unknown) =>
  callRoute(patchPage, {
    method: "PATCH",
    url: `/api/projects/${page.projectId}/strategies/${page.strategyId}/pages/${page.pageId}`,
    cookie: session.cookie,
    params: { id: page.projectId, strategyId: page.strategyId, pageId: page.pageId },
    body,
  });

const pageRow = (id: string) => prisma.strategyPage.findUniqueOrThrow({ where: { id }, select: { status: true, published_url: true } });

/** Pagina WRITING di un MEMBER del workspace, come dopo l'avvio dell'articolo. */
async function writingPage(label: string) {
  const setup = await memberWithPlan(`${label}-${randomUUID().slice(0, 8)}`);
  await prisma.strategyPage.update({ where: { id: setup.spoke.pageId }, data: { status: "WRITING", status_changed_at: new Date() } });
  return setup;
}

describe("indirizzo della pagina pubblicata", () => {
  // covers: AC-4502-2
  it("il MEMBER porta la pagina WRITING a PUBLISHED con l'indirizzo, un indirizzo ftp è 400 VALIDATION_ERROR", async () => {
    const { member, spoke } = await writingPage("t4502");
    const version = await strategyVersion(spoke.strategyId);

    const first = await sendPatch(member, spoke, { version, status: "PUBLISHED", publishedUrl: "https://www.esempio.it/noleggio/" });
    const afterFirst = await pageRow(spoke.pageId);
    const second = await sendPatch(member, spoke, { version: version + 1, status: "PUBLISHED", publishedUrl: "ftp://esempio.it" });

    expect(first.status).toBe(200);
    expect(afterFirst).toEqual({ status: "PUBLISHED", published_url: "https://www.esempio.it/noleggio/" });
    expect(second.status).toBe(400);
    expect(((await second.json()) as { code: string }).code).toBe("VALIDATION_ERROR");
    expect(await pageRow(spoke.pageId)).toEqual({ status: "PUBLISHED", published_url: "https://www.esempio.it/noleggio/" });
  });

  it("l'indirizzo si cambia in seguito; senza host, con le credenziali o oltre 500 caratteri è 400", async () => {
    const { member, spoke } = await writingPage("t4502-change");
    let version = await strategyVersion(spoke.strategyId);
    expect((await sendPatch(member, spoke, { version, status: "PUBLISHED", publishedUrl: "https://www.esempio.it/a/" })).status).toBe(200);
    version += 1;

    const changed = await sendPatch(member, spoke, { version, status: "PUBLISHED", publishedUrl: "  https://www.esempio.it/b/  " });
    version += 1;
    const invalid = ["https://", "https://utente:segreto@esempio.it/b/", `https://www.esempio.it/${"a".repeat(480)}`, "/b/"];
    const statuses = [];
    for (const publishedUrl of invalid) statuses.push((await sendPatch(member, spoke, { version, publishedUrl })).status);

    expect(changed.status).toBe(200);
    expect(statuses).toEqual([400, 400, 400, 400]);
    expect(await pageRow(spoke.pageId)).toEqual({ status: "PUBLISHED", published_url: "https://www.esempio.it/b/" });
  });

  it("«Rigenera» porta l'indirizzo sulla copia della pagina pubblicata", async () => {
    const { owner, member, plan, spoke } = await writingPage("t4502-regen");
    const version = await strategyVersion(spoke.strategyId);
    expect((await sendPatch(member, spoke, { version, status: "PUBLISHED", publishedUrl: "https://www.esempio.it/noleggio/" })).status).toBe(200);

    const regenerated = await callRoute(generate, {
      method: "POST",
      url: `/api/projects/${plan.projectId}/strategies`,
      cookie: owner.cookie,
      params: { id: plan.projectId },
      body: { mode: "AUTO", regenerate: true },
    });
    expect(regenerated.status).toBe(201);

    const copies = await prisma.strategyPage.findMany({
      where: { strategy: { project_id: plan.projectId }, NOT: { strategy_id: spoke.strategyId }, status: "PUBLISHED" },
      select: { published_url: true },
    });
    expect(copies).toEqual([{ published_url: "https://www.esempio.it/noleggio/" }]);
  });
});
