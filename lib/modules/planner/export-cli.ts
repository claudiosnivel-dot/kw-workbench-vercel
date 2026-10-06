import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { type CliIo, parseCliArgs, processIo } from "@/lib/modules/planner/cli-io";
import {
  buildPlannerExport,
  PLANNER_CHUNK_DEFAULT,
  PLANNER_CHUNK_MAX,
  plannerPartCsv,
  plannerPartFileName,
} from "@/lib/modules/planner/export-keywords";
import { loadPlannerExportRows } from "@/lib/modules/planner/export-source";

// CLI dell'operatore per l'export verso Keyword Planner (T-904): npm run planner:export -- --project <id> ...
// Non è esposta via HTTP; la sezione deve appartenere al progetto.

const DEFAULT_OUT_DIR = "planner-exports";

const USAGE = [
  "Uso: npm run planner:export -- --project <id> [--section <id>] [--chunk <n>] [--out <cartella>]",
  `  --chunk <n>: intero da 1 a ${PLANNER_CHUNK_MAX} (default ${PLANNER_CHUNK_DEFAULT})`,
  `  --out <cartella>: cartella dei file (default ./${DEFAULT_OUT_DIR}/)`,
].join("\n");

function parseChunk(raw: string | undefined): number | null {
  if (raw === undefined) {
    return PLANNER_CHUNK_DEFAULT;
  }
  const value = Number(raw);
  return /^\d+$/.test(raw) && value >= 1 && value <= PLANNER_CHUNK_MAX ? value : null;
}

/** Esegue l'export e restituisce l'exit code: 0 riuscito, 1 argomenti non validi o progetto/sezione non trovati. */
export async function runPlannerExportCli(argv: string[], io: CliIo = processIo): Promise<number> {
  const args = parseCliArgs(argv, ["project", "section", "chunk", "out"], USAGE, io);
  if (!args) {
    return 1;
  }
  const { values } = args;
  const chunkSize = parseChunk(values.chunk);
  if (!values.project || chunkSize === null || args.positionals.length > 0) {
    io.err(USAGE);
    return 1;
  }

  const source = await loadPlannerExportRows({ projectId: values.project, sectionId: values.section ?? null });
  if ("notFound" in source) {
    io.err(source.notFound === "project" ? "Progetto non trovato" : "Sezione non trovata nel progetto");
    return 1;
  }

  const plan = buildPlannerExport(source.rows, chunkSize);
  const outDir = values.out ?? DEFAULT_OUT_DIR;
  const files: string[] = [];
  if (plan.parts.length > 0) {
    await mkdir(outDir, { recursive: true });
  }
  for (const [index, keywords] of plan.parts.entries()) {
    const file = path.join(outDir, plannerPartFileName(values.project, values.section ?? null, index + 1));
    await writeFile(file, plannerPartCsv(keywords), "utf8");
    files.push(file);
  }

  io.out(JSON.stringify({ canonicals: plan.canonicals, parts: plan.parts.length, files, skipped: plan.skipped }, null, 2));
  return 0;
}
