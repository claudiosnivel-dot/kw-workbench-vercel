// CLI di import dei volumi da Keyword Planner (T-910): npm run planner:import -- --project <id> [--section <id>] <file>
import { runPlannerImportCli } from "@/lib/modules/planner/import-cli";
import { prisma } from "@/lib/prisma";

runPlannerImportCli(process.argv.slice(2))
  .then((code) => {
    process.exitCode = code;
  })
  .finally(() => prisma.$disconnect());
