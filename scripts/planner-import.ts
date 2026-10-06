// CLI di import dei volumi da Keyword Planner (T-910): npm run planner:import -- --project <id> [--section <id>] <file>
import { runCli } from "@/lib/modules/planner/cli-io";
import { runPlannerImportCli } from "@/lib/modules/planner/import-cli";
import { prisma } from "@/lib/prisma";

runCli(runPlannerImportCli, () => prisma.$disconnect());
