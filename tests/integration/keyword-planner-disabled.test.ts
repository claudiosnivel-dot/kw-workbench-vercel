// Gate di T-304 (AC-304-1…AC-304-3): il provider Google Keyword Planner non chiama più l'API
// dismessa, dichiara l'assenza dei volumi e non si può scegliere come nuovo valore.
import { randomBytes } from "node:crypto";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { POST as createProject } from "@/app/api/projects/route";
import { PATCH as updateProject } from "@/app/api/projects/[id]/route";
import { enqueueExtractionJob, runJobById } from "@/lib/modules/jobs/job-runner";
import { prisma } from "@/lib/prisma";
import { createUserWithSession } from "../helpers/auth";
import { resetDatabase } from "../helpers/db";
import { callRoute } from "../helpers/http";

const fetchMock = vi.fn(async (_input: string | URL | Request) => new Response("{}", { status: 400 }));

function projectPayload(name: string, metricsProvider: string) {
  return {
    name,
    language_code: "it",
    country_code: "IT",
    autocomplete_provider: "MOCK",
    metrics_provider: metricsProvider,
    min_volume: 0,
    exclude_brands: true,
    expand_alpha: true,
    expand_numeric: true,
    expand_patterns: true,
    auto_classification: true,
    scoring_profile: "balanced",
  };
}

beforeAll(() => {
  // Credenziali Ads fittizie generate a ogni esecuzione: con il provider attivo partirebbe la chiamata OAuth.
  for (const name of [
    "GOOGLE_ADS_DEVELOPER_TOKEN",
    "GOOGLE_ADS_CLIENT_ID",
    "GOOGLE_ADS_CLIENT_SECRET",
    "GOOGLE_ADS_CUSTOMER_ID",
    "GOOGLE_ADS_REFRESH_TOKEN",
  ]) {
    vi.stubEnv(name, randomBytes(8).toString("hex"));
  }
  vi.stubGlobal("fetch", fetchMock);
  vi.spyOn(console, "warn").mockImplementation(() => {});
});

afterAll(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

beforeEach(async () => {
  fetchMock.mockClear();
  await resetDatabase();
});

describe("estrazione con metrics_provider GOOGLE_KEYWORD_PLANNER", () => {
  // covers: AC-304-1
  it("non chiama le API Google, salva le candidate senza metriche e dichiara PROVIDER_DISABLED", async () => {
    const { user } = await createUserWithSession({ username: "t304-pipeline" });
    const project = await prisma.project.create({
      data: {
        name: "Planner disattivato",
        owner_user_id: user.id,
        autocomplete_provider: "MOCK",
        metrics_provider: "GOOGLE_KEYWORD_PLANNER",
      },
    });
    const section = await prisma.subproject.create({ data: { project_id: project.id, name: "Generale", position: 0 } });
    await prisma.seed.create({ data: { project_id: project.id, subproject_id: section.id, keyword: "caffe moka" } });

    const job = await enqueueExtractionJob(project.id, section.id);
    await runJobById(job.id);

    const stored = await prisma.job.findUniqueOrThrow({ where: { id: job.id } });
    const urls = fetchMock.mock.calls.map(([input]) => String(input));
    const candidates = await prisma.keywordCandidate.findMany({ where: { subproject_id: section.id } });

    expect(urls.filter((url) => url.includes("googleads.googleapis.com") || url.includes("oauth2.googleapis.com"))).toEqual([]);
    expect(candidates.length).toBeGreaterThan(0);
    expect(candidates.filter((row) => row.metrics_status !== "missing")).toEqual([]);
    expect((stored.result as { metricsNotice?: string } | null)?.metricsNotice).toBe("PROVIDER_DISABLED");
  });
});

describe("scelta di GOOGLE_KEYWORD_PLANNER come nuovo valore", () => {
  // covers: AC-304-2
  it("POST e PATCH rispondono 400 METRICS_PROVIDER_UNAVAILABLE e il progetto resta NONE", async () => {
    const { user, cookie } = await createUserWithSession({ username: "t304-owner" });
    const project = await prisma.project.create({
      data: { name: "Senza metriche", owner_user_id: user.id, metrics_provider: "NONE" },
    });

    const created = await callRoute(createProject, {
      method: "POST",
      url: "/api/projects",
      cookie,
      body: projectPayload("Nuovo con planner", "GOOGLE_KEYWORD_PLANNER"),
    });
    const updated = await callRoute(updateProject, {
      method: "PATCH",
      url: `/api/projects/${project.id}`,
      cookie,
      body: projectPayload("Senza metriche", "GOOGLE_KEYWORD_PLANNER"),
      params: { id: project.id },
    });

    for (const response of [created, updated]) {
      expect(response.status).toBe(400);
      expect(((await response.json()) as { code?: string }).code).toBe("METRICS_PROVIDER_UNAVAILABLE");
    }
    expect((await prisma.project.findUniqueOrThrow({ where: { id: project.id } })).metrics_provider).toBe("NONE");
  });

  // covers: AC-304-3
  it("un progetto che lo ha già lo conserva quando si cambia solo il nome", async () => {
    const { user, cookie } = await createUserWithSession({ username: "t304-legacy" });
    const project = await prisma.project.create({
      data: { name: "Con planner", owner_user_id: user.id, metrics_provider: "GOOGLE_KEYWORD_PLANNER" },
    });

    const response = await callRoute(updateProject, {
      method: "PATCH",
      url: `/api/projects/${project.id}`,
      cookie,
      body: projectPayload("Con planner rinominato", "GOOGLE_KEYWORD_PLANNER"),
      params: { id: project.id },
    });

    const row = await prisma.project.findUniqueOrThrow({ where: { id: project.id } });
    expect(response.status).toBe(200);
    expect(row.name).toBe("Con planner rinominato");
    expect(row.metrics_provider).toBe("GOOGLE_KEYWORD_PLANNER");
  });
});
