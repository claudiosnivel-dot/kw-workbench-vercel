/** Uscita delle CLI del round-trip con Keyword Planner (T-904, T-910): sostituibile nei test. */
export type CliIo = { out: (line: string) => void; err: (line: string) => void };

export const processIo: CliIo = {
  out: (line) => process.stdout.write(`${line}\n`),
  err: (line) => process.stderr.write(`${line}\n`),
};
