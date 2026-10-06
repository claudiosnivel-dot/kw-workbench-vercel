// CLI di export per Keyword Planner (T-904): npm run planner:export -- --project <id> [--section <id>] [--chunk <n>] [--out <cartella>]
import { runCli } from "@/lib/modules/planner/cli-io";
import { runPlannerExportCli } from "@/lib/modules/planner/export-cli";
import { prisma } from "@/lib/prisma";

runCli(runPlannerExportCli, () => prisma.$disconnect());
