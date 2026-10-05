import { readFile } from "node:fs/promises";
import { parseArgs } from "node:util";
import { type CliIo, processIo } from "@/lib/modules/planner/cli-io";
import { parsePlannerCsv } from "@/lib/modules/planner/csv-parser";
import { applyPlannerImport } from "@/lib/modules/planner/import";

// CLI dell'operatore per l'import dei volumi da Keyword Planner (T-910), stessa funzione dell'upload:
// npm run planner:import -- --project <id> [--section <id>] <file>

const USAGE = "Uso: npm run planner:import -- --project <id> [--section <id>] <file>";

/** Esegue l'import e restituisce l'exit code: 0 riuscito, 1 argomenti, file o progetto/sezione non validi. */
export async function runPlannerImportCli(argv: string[], io: CliIo = processIo): Promise<number> {
  let parsedArgs;
  try {
    parsedArgs = parseArgs({
      args: argv,
      options: { project: { type: "string" }, section: { type: "string" } },
      allowPositionals: true,
    });
  } catch (error) {
    io.err(`${error instanceof Error ? error.message : String(error)}\n${USAGE}`);
    return 1;
  }
  const { values, positionals } = parsedArgs;
  if (!values.project || positionals.length !== 1) {
    io.err(USAGE);
    return 1;
  }

  try {
    const parsed = parsePlannerCsv(new Uint8Array(await readFile(positionals[0])));
    const summary = await applyPlannerImport(values.project, values.section ?? null, parsed.rows);
    io.out(JSON.stringify({ ...summary, skippedRows: parsed.skippedRows }, null, 2));
    return 0;
  } catch (error) {
    // File illeggibile o non riconosciuto, progetto o sezione non trovati: messaggio ed exit code 1.
    io.err(error instanceof Error ? error.message : String(error));
    return 1;
  }
}
