// Gate di T-3702 (AC-3702-1, D-44): la ricerca usa solo le composizioni globali della sua lingua; una lingua senza
// composizioni cerca la parola, la parola con le lettere e con le cifre. Autocomplete simulato, nessuna chiamata reale.
// Gate di T-5001 (AC-5001-1, D-47): una ricerca in spagnolo usa le 8 composizioni spagnole del seed.
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

/** La parola, la parola con a…z e con 0…9: le query di una ricerca senza composizioni. */
function baseQueries(seed: string): string[] {
  return [seed, ...LETTERS.map((letter) => `${seed} ${letter}`), ...DIGITS.map((digit) => `${seed} ${digit}`)];
}

// Composizioni italiane e inglesi del seed (T-3702), scritte qui per verificare che la ricerca spagnola non le usi.
const OTHER_LANGUAGE_PATTERNS = [
  "{seed} for beginners",
  "best {seed}",
  "{seed} near me",
  "how to {seed}",
  "{seed} vs {seed} alternative",
  "free {seed} tool",
  "{seed} template",
  "{seed} examples",
  "{seed} per",
  "{seed} vicino a me",
  "{seed} recensioni",
  "{seed} prezzo",
  "{seed} online",
  "migliori {seed}",
  "{seed} offerte",
  "{seed} opinioni",
];

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
  // impacted-by: T-5001 (lo spagnolo ha le sue composizioni: la lingua senza composizioni è il francese)
  it("italiano con le composizioni italiane, inglese con le inglesi, francese solo con parola, lettere e cifre", async () => {
    const { user } = await createUserWithSession({ displayName: "t3702-owner" });
    const workspaceId = await personalWorkspaceId(user.id);

    const italian = await queriesOf(workspaceId, "it", "IT", "letto ospedaliero");
    const english = await queriesOf(workspaceId, "en", "US", "running shoes");
    const french = await queriesOf(workspaceId, "fr", "FR", "chaussures");

    expect(italian).toContain("letto ospedaliero prezzo");
    expect(italian).toContain("migliori letto ospedaliero");
    expect(italian.filter((query) => query.includes("near me") || query.includes("best"))).toEqual([]);
    expect(english).toContain("best running shoes");
    expect(english.filter((query) => query.includes("prezzo"))).toEqual([]);
    expect([...french].sort()).toEqual(baseQueries("chaussures").sort());
  });

  // covers: AC-5001-1
  it("spagnolo con le 8 composizioni spagnole e nessuna italiana o inglese", async () => {
    const { user } = await createUserWithSession({ displayName: "t5001-owner" });
    const workspaceId = await personalWorkspaceId(user.id);

    const spanish = await queriesOf(workspaceId, "es", "ES", "cama de hospital");

    const compositions = [
      "qué es cama de hospital",
      "cama de hospital precio",
      "comprar cama de hospital",
      "cama de hospital con",
      "mejor cama de hospital",
      "tipos de cama de hospital",
      "cama de hospital opiniones",
      "cama de hospital cerca de mí",
    ];
    for (const query of compositions) {
      expect(spanish).toContain(query);
    }
    const others = OTHER_LANGUAGE_PATTERNS.map((pattern) => pattern.replaceAll("{seed}", "cama de hospital"));
    expect(spanish.filter((query) => others.includes(query))).toEqual([]);
    expect([...spanish].sort()).toEqual([...baseQueries("cama de hospital"), ...compositions].sort());
  });
});
