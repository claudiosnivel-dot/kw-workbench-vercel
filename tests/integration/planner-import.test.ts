// Gate di T-910 (AC-910-1, AC-910-2): upload del file di Keyword Planner nella pagina dei risultati, abbinato
// alle candidate per canonical, con metriche e punteggio aggiornati; 404 agli altri utenti, 413 oltre 5 MB.
import { beforeEach, describe, expect, it } from "vitest";
import { NextRequest } from "next/server";
import { POST as plannerImport } from "@/app/api/projects/[id]/planner-import/route";
import { scoreKeyword } from "@/lib/modules/scoring";
import { prisma } from "@/lib/prisma";
import { createUserWithSession, personalWorkspaceId } from "../helpers/auth";
import { resetDatabase } from "../helpers/db";

function uploadRequest(projectId: string, cookie: string, content: Uint8Array<ArrayBuffer> | string): NextRequest {
  const form = new FormData();
  form.set("file", new File([content], "keyword-stats.csv", { type: "text/csv" }));
  return new NextRequest(new URL(`/api/projects/${projectId}/planner-import`, "http://localhost:3000"), {
    method: "POST",
    headers: { cookie },
    body: form,
  });
}

async function createProjectWithCandidate(ownerId: string) {
  const project = await prisma.project.create({ data: { name: "Import", workspace_id: await personalWorkspaceId(ownerId), language_code: "it" } });
  const section = await prisma.subproject.create({ data: { project_id: project.id, name: "Generale", position: 0 } });
  const baseline = scoreKeyword({
    raw_keyword: "caffè espresso",
    keyword: "caffè espresso",
    brand_status: "allowed",
    search_intent: "mixed",
    metrics_status: "missing",
    scoring_profile: "balanced",
  });
  const candidate = await prisma.keywordCandidate.create({
    data: {
      project_id: project.id,
      subproject_id: section.id,
      keyword: "caffè espresso",
      normalized_keyword: "caffè espresso",
      canonical_keyword: "caffe espresso",
      source: "seed",
      source_query: "caffè espresso",
      score: baseline.score,
      score_source: baseline.score_source,
    },
  });
  return { project, section, candidate };
}

beforeEach(async () => {
  await resetDatabase();
});

describe("POST /api/projects/[id]/planner-import", () => {
  // covers: AC-910-1
  it("abbina la riga del file per canonical e aggiorna volumi, provider, stato e punteggio", async () => {
    const owner = await createUserWithSession();
    const { project, candidate } = await createProjectWithCandidate(owner.user.id);
    const csv = "Keyword\tAvg. monthly searches\tCompetition\nCaffe Espresso\t1200\tLow\n";

    const response = await plannerImport(uploadRequest(project.id, owner.cookie, csv), {
      params: Promise.resolve({ id: project.id }),
    });

    expect(response.status).toBe(200);
    expect(((await response.json()) as { data: { matched: number } }).data.matched).toBe(1);
    const stored = await prisma.keywordCandidate.findUniqueOrThrow({ where: { id: candidate.id } });
    expect(stored.avg_monthly_searches).toBe(1200);
    expect(stored.metrics_provider).toBe("PLANNER_CSV");
    expect(stored.metrics_status).toBe("imported");
    expect(stored.metrics_precision).toBe("exact");
    expect(stored.score_source).toBe("metrics");
    expect(stored.score).not.toBe(candidate.score);
    expect(stored.metrics_updated_at).not.toBeNull();
  });

  // covers: AC-910-2
  it("risponde 404 a un altro utente e 413 a un file oltre 5 MB senza toccare le candidate", async () => {
    const owner = await createUserWithSession();
    const other = await createUserWithSession();
    const { project } = await createProjectWithCandidate(owner.user.id);
    const csv = "Keyword\tAvg. monthly searches\ncaffe espresso\t1200\n";
    const big = new Uint8Array(6 * 1024 * 1024).fill(0x61);

    const foreign = await plannerImport(uploadRequest(project.id, other.cookie, csv), {
      params: Promise.resolve({ id: project.id }),
    });
    const tooLarge = await plannerImport(uploadRequest(project.id, owner.cookie, big), {
      params: Promise.resolve({ id: project.id }),
    });

    expect(foreign.status).toBe(404);
    expect(tooLarge.status).toBe(413);
    expect(await prisma.keywordCandidate.count({ where: { metrics_updated_at: { not: null } } })).toBe(0);
  });
});
