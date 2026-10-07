// Gate di T-904 (AC-904-4): download web dell'export per Keyword Planner, solo per il proprietario del progetto.
import { beforeEach, describe, expect, it } from "vitest";
import { GET as plannerExport } from "@/app/api/projects/[id]/planner-export/route";
import { prisma } from "@/lib/prisma";
import { createUserWithSession, personalWorkspaceId } from "../helpers/auth";
import { resetDatabase } from "../helpers/db";
import { callRoute } from "../helpers/http";

beforeEach(async () => {
  await resetDatabase();
});

describe("GET /api/projects/[id]/planner-export", () => {
  // covers: AC-904-4
  it("dà al proprietario il riepilogo e il blocco CSV richiesto, 404 a un altro utente", async () => {
    const owner = await createUserWithSession();
    const other = await createUserWithSession();
    const project = await prisma.project.create({ data: { name: "Planner", workspace_id: await personalWorkspaceId(owner.user.id), language_code: "it" } });
    const section = await prisma.subproject.create({ data: { project_id: project.id, name: "Generale", position: 0 } });
    await prisma.keywordCandidate.createMany({
      data: Array.from({ length: 1500 }, (_, index) => ({
        project_id: project.id,
        subproject_id: section.id,
        keyword: `moka ${String(index).padStart(4, "0")}`,
        normalized_keyword: `moka ${String(index).padStart(4, "0")}`,
        canonical_keyword: `moka ${String(index).padStart(4, "0")}`,
        source: "seed",
        source_query: "moka",
      })),
    });
    const url = `/api/projects/${project.id}/planner-export`;

    const summary = await callRoute(plannerExport, { url, cookie: owner.cookie, params: { id: project.id } });
    const part = await callRoute(plannerExport, { url: `${url}?part=2`, cookie: owner.cookie, params: { id: project.id } });
    const foreign = await callRoute(plannerExport, { url, cookie: other.cookie, params: { id: project.id } });

    expect(summary.status).toBe(200);
    expect(((await summary.json()) as { data: { parts: number; canonicals: number } }).data).toMatchObject({
      parts: 2,
      canonicals: 1500,
    });
    expect(part.status).toBe(200);
    expect(part.headers.get("content-type")).toContain("text/csv");
    expect(part.headers.get("content-disposition")).toMatch(/^attachment; filename="[^"]+-part02\.csv"$/);
    const lines = (await part.text()).split(/\r?\n/).filter((line) => line !== "");
    expect(lines[0]).toBe("Keyword");
    expect(lines.slice(1)).toHaveLength(500);
    expect(foreign.status).toBe(404);
  });
});
