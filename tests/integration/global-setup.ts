import { spawnSync } from "node:child_process";
import { createRequire } from "node:module";
import { assertLocalTestDatabase } from "../helpers/db-guard";

const require = createRequire(import.meta.url);

/** Prima la guardia, poi le migrazioni: mai un TRUNCATE o una migrazione su un DB non locale. */
export default function setup(): void {
  const url = assertLocalTestDatabase(process.env.TEST_DATABASE_URL);

  // Il CLI di Prisma lanciato con node evita npx/.cmd su Windows.
  const prismaCli = require.resolve("prisma/build/index.js");
  const result = spawnSync(process.execPath, [prismaCli, "migrate", "deploy"], {
    env: { ...process.env, DATABASE_URL: url, DIRECT_URL: url },
    encoding: "utf8",
  });

  if (result.status !== 0) {
    throw new Error(`prisma migrate deploy sul DB di test fallito (exit ${result.status}):\n${result.stderr}`);
  }
}
