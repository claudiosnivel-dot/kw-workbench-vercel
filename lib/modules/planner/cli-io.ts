import { parseArgs } from "node:util";

/** Uscita delle CLI del round-trip con Keyword Planner (T-904, T-910): sostituibile nei test. */
export type CliIo = { out: (line: string) => void; err: (line: string) => void };

export const processIo: CliIo = {
  out: (line) => process.stdout.write(`${line}\n`),
  err: (line) => process.stderr.write(`${line}\n`),
};

/** Opzioni stringa nominate e argomenti posizionali; null, con il messaggio d'uso su err, se non sono validi. */
export function parseCliArgs(
  argv: string[],
  names: string[],
  usage: string,
  io: CliIo
): { values: Record<string, string | undefined>; positionals: string[] } | null {
  try {
    const parsed = parseArgs({
      args: argv,
      options: Object.fromEntries(names.map((name) => [name, { type: "string" as const }])),
      allowPositionals: true,
    });
    return { values: parsed.values as Record<string, string | undefined>, positionals: parsed.positionals };
  } catch (error) {
    io.err(`${error instanceof Error ? error.message : String(error)}\n${usage}`);
    return null;
  }
}

/** Avvia una CLI con gli argomenti del processo, ne usa l'exit code e chiude le risorse alla fine. */
export function runCli(main: (argv: string[]) => Promise<number>, cleanup: () => Promise<void>): void {
  main(process.argv.slice(2))
    .then((code) => {
      process.exitCode = code;
    })
    .finally(cleanup);
}
