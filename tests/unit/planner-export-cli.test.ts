// Gate di T-904 (AC-904-1…AC-904-3): CLI di export delle keyword per Keyword Planner, con il DB sostituito
// da candidate in memoria e file scritti in una cartella temporanea.
import { mkdtemp, readdir, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { canonicalizeKeyword } from "@/lib/modules/normalization";

type Candidate = { id: string; keyword: string; subproject_id: string };

const db = vi.hoisted(() => ({ candidates: [] as Candidate[] }));

const SECTION = {
  id: "section-a",
  language_code_override: null,
  country_code_override: null,
  autocomplete_provider_override: null,
  metrics_provider_override: null,
  min_volume_override: null,
  exclude_brands_override: null,
  expand_alpha_override: null,
  expand_numeric_override: null,
  expand_patterns_override: null,
  auto_classification_override: null,
  scoring_profile_override: null,
};

vi.mock("@/lib/prisma", () => ({
  prisma: {
    project: {
      findFirst: vi.fn(async ({ where }: { where: { id: string } }) =>
        where.id === "project-a"
          ? {
              id: "project-a",
              language_code: "it",
              country_code: "IT",
              autocomplete_provider: "MOCK",
              metrics_provider: "NONE",
              min_volume: 0,
              exclude_brands: true,
              expand_alpha: true,
              expand_numeric: true,
              expand_patterns: true,
              auto_classification: true,
              scoring_profile: "balanced",
              subprojects: [SECTION, { ...SECTION, id: "section-b" }],
            }
          : null
      ),
    },
    keywordCandidate: {
      findMany: vi.fn(async ({ where }: { where: { subproject_id: { in: string[] } } }) =>
        db.candidates
          .filter((candidate) => where.subproject_id.in.includes(candidate.subproject_id))
          .sort((a, b) => (a.keyword < b.keyword ? -1 : a.keyword > b.keyword ? 1 : a.id < b.id ? -1 : 1))
      ),
    },
  },
}));

let outDir = "";
let output: string[] = [];
const io = { out: (line: string) => output.push(line), err: (line: string) => output.push(line) };

async function run(args: string[]): Promise<number> {
  const { runPlannerExportCli } = await import("@/lib/modules/planner/export-cli");
  return runPlannerExportCli(args, io);
}

async function writtenFiles(): Promise<Record<string, string[]>> {
  const names = (await readdir(outDir)).sort();
  const files: Record<string, string[]> = {};
  for (const name of names) {
    files[name] = (await readFile(path.join(outDir, name), "utf8")).split(/\r?\n/).filter((line) => line !== "");
  }
  return files;
}

beforeEach(async () => {
  outDir = await mkdtemp(path.join(tmpdir(), "planner-export-"));
  output = [];
  db.candidates = [];
});

afterEach(async () => {
  await rm(outDir, { recursive: true, force: true });
});

describe("CLI planner:export", () => {
  // covers: AC-904-1
  it("scrive blocchi da --chunk keyword con la riga Keyword e un solo file per canonical", async () => {
    // 2.100 canonical distinti; 400 candidate di un'altra sezione differiscono solo per le maiuscole (stesso canonical).
    db.candidates = [
      ...Array.from({ length: 2100 }, (_, index) => ({ id: `c${index}`, keyword: `moka ${index}`, subproject_id: "section-a" })),
      ...Array.from({ length: 400 }, (_, index) => ({ id: `d${index}`, keyword: `Moka ${index}`, subproject_id: "section-b" })),
    ];

    const code = await run(["--project", "project-a", "--chunk", "1000", "--out", outDir]);

    expect(code).toBe(0);
    const files = await writtenFiles();
    expect(Object.keys(files)).toEqual([
      "project-a-all-part01.csv",
      "project-a-all-part02.csv",
      "project-a-all-part03.csv",
    ]);
    expect(Object.values(files).map((lines) => lines.length)).toEqual([1001, 1001, 101]);
    expect(Object.values(files).every((lines) => lines[0] === "Keyword")).toBe(true);
    const canonicals = Object.values(files).flatMap((lines) => lines.slice(1).map((keyword) => canonicalizeKeyword(keyword, "it")));
    expect(new Set(canonicals).size).toBe(2100);
    expect(canonicals).toHaveLength(2100);
    // Prima candidata in ordine keyword asc, id asc: «Moka 0» precede «moka 0».
    expect(files["project-a-all-part01.csv"]).toContain("Moka 0");
  });

  // covers: AC-904-2
  it("salta le keyword oltre i limiti di Keyword Planner o con un prefisso da formula e le riporta con il motivo", async () => {
    const tooLong = "a".repeat(81);
    const tooManyWords = "uno due tre quattro cinque sei sette otto nove dieci undici";
    const formula = "=moka";
    db.candidates = [tooLong, tooManyWords, formula, "moka express", "caffettiera moka"].map((keyword, index) => ({
      id: `k${index}`,
      keyword,
      subproject_id: "section-a",
    }));

    const code = await run(["--project", "project-a", "--out", outDir]);

    expect(code).toBe(0);
    const files = await writtenFiles();
    const written = Object.values(files).flatMap((lines) => lines.slice(1));
    expect(written.sort()).toEqual(["caffettiera moka", "moka express"]);
    const summary = JSON.parse(output.join("\n")) as { skipped: { keyword: string; reason: string }[] };
    expect(summary.skipped).toHaveLength(3);
    expect(summary.skipped).toEqual(
      expect.arrayContaining([
        { keyword: tooLong, reason: "too_long" },
        { keyword: tooManyWords, reason: "too_many_words" },
        { keyword: formula, reason: "formula_prefix" },
      ])
    );
  });

  // covers: AC-904-3
  it("esce con 1 senza scrivere file per una sezione di un altro progetto o un --chunk non valido", async () => {
    db.candidates = [{ id: "k1", keyword: "moka express", subproject_id: "section-a" }];

    expect(await run(["--project", "project-a", "--section", "section-other", "--out", outDir])).toBe(1);
    expect(await readdir(outDir)).toEqual([]);

    for (const chunk of ["0", "abc"]) {
      output = [];
      expect(await run(["--project", "project-a", "--chunk", chunk, "--out", outDir])).toBe(1);
      expect(await readdir(outDir)).toEqual([]);
      expect(output.join("\n")).toContain("--chunk <n>: intero da 1 a 10000");
    }
  });
});
