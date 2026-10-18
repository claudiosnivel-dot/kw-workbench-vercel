// Gate di T-3702 (AC-3702-1, D-44): la ricerca usa solo le composizioni globali della sua lingua; una lingua senza
// composizioni cerca la parola, la parola con le lettere e con le cifre. Autocomplete simulato, nessuna chiamata reale.
import { beforeEach, describe, expect, it, vi } from "vitest";
import { enqueueExtractionJob, runJobById } from "@/lib/modules/jobs/job-runner";
import { prisma } from "@/lib/prisma";
import { seedGlobalDefaults } from "@/prisma/seed";
import { createUserWithSession, personalWorkspaceId } from "../helpers/auth";
import { resetDatabase } from "../helpers/db";

// Query ricevute dall'autocomplete simulato, nell'ordine.
const autocomplete = vi.hoisted(() => ({ queries: [] as string[] }));

vi.mock("@/lib/modules/providers/autocomplete/factory", () => ({
  createAutocompleteProvider: () => ({
    id: "MOCK",
    suggest: async ({ query }: { query: string }) => {
      autocomplete.queries.push(query);
      return [];
    },
  }),
}));

const LETTERS = Array.from({ length: 26 }, (_, index) => String.fromCharCode(97 + index));
const DIGITS = Array.from({ length: 10 }, (_, index) => String(index));

/** Query della ricerca di un argomento con una sola seed nella lingua data. */
async function queriesOf(workspaceId: string, languageCode: string, countryCode: string, seed: string): Promise<string[]> {
  const project = await prisma.project.create({
    data: {
      name: `Lingua ${languageCode}`,
      workspace_id: workspaceId,
      language_code: languageCode,
      country_code: countryCode,
      autocomplete_provider: "MOCK",
      metrics_provider: "NONE",
    },
  });
  const topic = await prisma.subproject.create({ data: { project_id: project.id, name: seed, position: 0 } });
  await prisma.seed.create({ data: { project_id: project.id, subproject_id: topic.id, keyword: seed } });

  autocomplete.queries.length = 0;
  const { job } = await enqueueExtractionJob(project.id, topic.id);
  await runJobById(job.id);
  expect((await prisma.job.findUniqueOrThrow({ where: { id: job.id } })).status).toBe("completed");
  return [...autocomplete.queries];
}

beforeEach(async () => {
  await resetDatabase();
  await seedGlobalDefaults(prisma);
});

describe("composizioni nella lingua della ricerca", () => {
  // covers: AC-3702-1
  it("italiano con le composizioni italiane, inglese con le inglesi, spagnolo solo con parola, lettere e cifre", async () => {
    const { user } = await createUserWithSession({ displayName: "t3702-owner" });
    const workspaceId = await personalWorkspaceId(user.id);

    const italian = await queriesOf(workspaceId, "it", "IT", "letto ospedaliero");
    const english = await queriesOf(workspaceId, "en", "US", "running shoes");
    const spanish = await queriesOf(workspaceId, "es", "ES", "zapatillas");

    expect(italian).toContain("letto ospedaliero prezzo");
    expect(italian).toContain("migliori letto ospedaliero");
    expect(italian.filter((query) => query.includes("near me") || query.includes("best"))).toEqual([]);
    expect(english).toContain("best running shoes");
    expect(english.filter((query) => query.includes("prezzo"))).toEqual([]);
    expect([...spanish].sort()).toEqual(
      ["zapatillas", ...LETTERS.map((letter) => `zapatillas ${letter}`), ...DIGITS.map((digit) => `zapatillas ${digit}`)].sort()
    );
  });
});
