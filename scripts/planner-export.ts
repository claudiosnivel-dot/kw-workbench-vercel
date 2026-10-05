// CLI di export per Keyword Planner (T-904): npm run planner:export -- --project <id> [--section <id>] [--chunk <n>] [--out <cartella>]
import { runPlannerExportCli } from "@/lib/modules/planner/export-cli";
import { prisma } from "@/lib/prisma";

runPlannerExportCli(process.argv.slice(2))
  .then((code) => {
    process.exitCode = code;
  })
  .finally(() => prisma.$disconnect());
