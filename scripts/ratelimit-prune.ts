// Pulizia dei tentativi del rate limit usciti dalla finestra più lunga (T-1701): npm run ratelimit:prune
import { prisma } from "@/lib/prisma";
import { pruneRateLimitHits } from "@/lib/security/rate-limit";

pruneRateLimitHits()
  .then((count) => {
    process.stdout.write(`Tentativi eliminati: ${count}\n`);
  })
  .catch((error: unknown) => {
    process.stderr.write(`Pulizia non riuscita: ${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
