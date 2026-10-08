// Controllo dei testi legali prima del rilascio (T-1803, D-15): npm run legal:check [-- --dir <cartella>].
// Esce con 1 se un documento manca, è segnaposto, non ha version o last_updated, o se la version dei termini differisce
// da LEGAL_TERMS_VERSION del consenso (T-1405); passo della checklist di rilascio (docs/RELEASE.md), non del build.
// Gira con tsx (script npm) perché importa il controllo TypeScript usato anche dalla checklist del lancio (T-1606).
import path from "node:path";
import { checkLegalDocuments, LEGAL_CONTENT_DIR } from "../lib/legal/documents.ts";

const dirIndex = process.argv.indexOf("--dir");
const dir = dirIndex >= 0 && process.argv[dirIndex + 1] ? path.resolve(process.argv[dirIndex + 1]) : LEGAL_CONTENT_DIR;
const problems = checkLegalDocuments(dir);

if (problems.length > 0) {
  for (const problem of problems) {
    console.error(`legal:check: ${problem}`);
  }
  process.exit(1);
}

console.log(`legal:check: 6 documenti legali pubblicabili in ${path.relative(process.cwd(), dir) || "."}`);
