// Gate di T-810 (AC-810-1…4): la dashboard pagina i progetti a 20 per pagina in ordine di ultima attività
// reale (estrazioni, sezioni, revisione), sempre dentro i progetti dell'utente della sessione.
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { PATCH as patchResults } from "@/app/api/projects/[id]/results/route";
import { POST as createSection } from "@/app/api/projects/[id]/subprojects/route";
import { listDashboardProjects } from "@/lib/modules/dashboard";
import { enqueueExtractionJob, runJobById } from "@/lib/modules/jobs/job-runner";
import { prisma } from "@/lib/prisma";
import { createUserWithSession } from "../helpers/auth";
import { resetDatabase } from "../helpers/db";
import { callRoute } from "../helpers/http";

const HOUR_MS = 60 * 60 * 1000;

/** Progetti P01..Pn: P01 ha l'attività più vecchia, Pn la più recente, tutte nel passato. */
async function createProjects(ownerId: string, count: number, prefix = "P") {
  const now = Date.now();
  const ids: string[] = [];
  for (let index = 1; index <= count; index += 1) {
    const project = await prisma.project.create({
      data: {
        name: `${prefix}${String(index).padStart(2, "0")}`,
        owner_user_id: ownerId,
        language_code: "it",
        country_code: "IT",
        autocomplete_provider: "MOCK",
        metrics_provider: "NONE",
        expand_alpha: false,
        expand_numeric: false,
        expand_patterns: false,
        last_activity_at: new Date(now - (count + 1 - index) * HOUR_MS),
      },
    });
    ids.push(project.id);
  }
  return ids;
}

async function allPages(userId: string) {
  const first = await listDashboardProjects(userId, 1);
  const rest = [];
  for (let page = 2; page <= first.totalPages; page += 1) {
    rest.push(await listDashboardProjects(userId, page));
  }
  return [first, ...rest];
}

beforeAll(() => {
  vi.stubEnv("APP_AUTH_ENABLED", "true");
});

afterAll(() => {
  vi.unstubAllEnvs();
});

beforeEach(async () => {
  await resetDatabase();
});

describe("paginazione della dashboard", () => {
  // covers: AC-810-1
  it("45 progetti in pagine da 20, 20 e 5, tutti distinti; la pagina 99 diventa la 3", async () => {
    const { user } = await createUserWithSession({ displayName: "t810-pages" });
    await createProjects(user.id, 45);

    const pages = await Promise.all([1, 2, 3].map((page) => listDashboardProjects(user.id, page)));
    const beyond = await listDashboardProjects(user.id, 99);

    const ids = pages.flatMap((result) => result.items.map((item) => item.id));
    expect(pages.map((result) => result.items.length)).toEqual([20, 20, 5]);
    expect(new Set(ids).size).toBe(45);
    expect(pages[0].total).toBe(45);
    expect(pages[0].totalPages).toBe(3);
    expect(beyond.page).toBe(3);
    expect(beyond.items).toHaveLength(5);
  });
});

describe("attività reale", () => {
  // covers: AC-810-2
  it("un'estrazione terminata porta il progetto in cima con last_activity_at uguale a completed_at", async () => {
    const { user } = await createUserWithSession({ displayName: "t810-job" });
    const [p01] = await createProjects(user.id, 45);
    const section = await prisma.subproject.create({ data: { project_id: p01, name: "Generale", position: 0 } });
    await prisma.seed.create({ data: { project_id: p01, subproject_id: section.id, keyword: "caffè moka" } });
    const { job } = await enqueueExtractionJob(p01, section.id);

    const finished = await runJobById(job.id);
    const first = await listDashboardProjects(user.id, 1);
    const project = await prisma.project.findUniqueOrThrow({ where: { id: p01 } });

    expect(finished?.status).toBe("completed");
    expect(first.items[0].id).toBe(p01);
    expect(project.last_activity_at.getTime()).toBe(finished?.completed_at?.getTime());
  });

  // covers: AC-810-3
  it("creare una sezione e revisionare keyword fanno salire i progetti in cima", async () => {
    const owner = await createUserWithSession({ displayName: "t810-touch" });
    const ids = await createProjects(owner.user.id, 45);
    const [p02, p03] = [ids[1], ids[2]];
    const before = await allPages(owner.user.id);
    const p03Section = await prisma.subproject.create({ data: { project_id: p03, name: "Generale", position: 0 } });
    await prisma.keywordCandidate.create({
      data: {
        project_id: p03,
        subproject_id: p03Section.id,
        keyword: "scarpe",
        normalized_keyword: "scarpe",
        canonical_keyword: "scarpe",
        source: "seed",
        source_query: "scarpe",
      },
    });

    const created = await callRoute(createSection, {
      method: "POST",
      url: `/api/projects/${p02}/subprojects`,
      cookie: owner.cookie,
      params: { id: p02 },
      body: { name: "Nuova sezione" },
    });
    const approved = await callRoute(patchResults, {
      method: "PATCH",
      url: `/api/projects/${p03}/results`,
      cookie: owner.cookie,
      params: { id: p03 },
      body: { action: "approve", filters: {} },
    });
    const first = await listDashboardProjects(owner.user.id, 1);

    expect(before[2].items.map((item) => item.id)).toEqual(expect.arrayContaining([p02, p03]));
    expect(created.status).toBe(201);
    expect(approved.status).toBe(200);
    expect(first.items.slice(0, 2).map((item) => item.id)).toEqual([p03, p02]);
  });
});

describe("perimetro dell'utente", () => {
  // covers: AC-810-4
  it("nessun progetto di B compare nelle pagine di A", async () => {
    const a = await createUserWithSession({ displayName: "t810-a" });
    const b = await createUserWithSession({ displayName: "t810-b" });
    await createProjects(a.user.id, 45, "A");
    const idsOfB = await createProjects(b.user.id, 7, "B");

    const pages = await allPages(a.user.id);
    const seen = pages.flatMap((result) => result.items.map((item) => item.id));

    expect(pages[0].total).toBe(45);
    expect(seen).toHaveLength(45);
    expect(seen.filter((id) => idsOfB.includes(id))).toEqual([]);
  });
});
