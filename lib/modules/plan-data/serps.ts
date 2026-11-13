import { canUseLicensedMetrics } from "@/lib/billing/enforce";
import type { MetricsContext, MetricsItem } from "@/lib/modules/providers/metrics/types";
import {
  collectSerpTasks,
  postSerpTasks,
  type SerpCollectOutcome,
  type SerpPostOutcome,
  type SerpTask,
} from "@/lib/modules/providers/serp/dataforseo-serp";
import { prisma } from "@/lib/prisma";

// Risultati di Google per il piano (T-6101, D-57): quelli salvati da meno di 30 giorni si riusano, gli altri si chiedono
// a DataForSEO. Solo chi può usare i dati con licenza (D-30, canUseLicensedMetrics) fa partire richieste; gli altri
// ricevono PLAN_NO_LICENSED_METRICS e il piano usa il motore di oggi (modulo 62).

/** Età massima dei risultati salvati: oltre, una keyword si chiede di nuovo a DataForSEO. */
export const SERP_MAX_AGE_DAYS = 30;
const DAY_MS = 86_400_000;

/** Contesto delle richieste per il piano: lingua e paese, progetto e lavoro per il registro, chi chiede e il suo workspace. */
export type PlanDataContext = MetricsContext & { actor: { isRootAdmin: boolean }; workspaceId: string };

export type SerpRequestOutcome = SerpPostOutcome & {
  /** URL salvati da meno di 30 giorni, per forma canonica: queste keyword non sono state inviate. */
  fresh: Map<string, string[]>;
};

/** Risultati salvati da meno di SERP_MAX_AGE_DAYS giorni per le forme canoniche, nella lingua e nel paese indicati. */
export async function readFreshSerps(
  canonicals: string[],
  context: Pick<MetricsContext, "languageCode" | "countryCode">,
  now: Date = new Date()
): Promise<Map<string, string[]>> {
  if (canonicals.length === 0) {
    return new Map();
  }
  const rows = await prisma.keywordSerp.findMany({
    where: {
      language_code: context.languageCode.toLowerCase(),
      country_code: context.countryCode.toUpperCase(),
      canonical_keyword: { in: [...new Set(canonicals)] },
      fetched_at: { gt: new Date(now.getTime() - SERP_MAX_AGE_DAYS * DAY_MS) },
    },
    select: { canonical_keyword: true, urls: true },
  });
  return new Map(rows.map((row) => [row.canonical_keyword, row.urls]));
}

/**
 * Chiede i risultati delle keyword senza risultati recenti (una per forma canonica): i task inviati si raccolgono con
 * collectSerps. Senza il diritto ai dati con licenza nessuna lettura e nessuna chiamata.
 */
export async function requestSerps(items: MetricsItem[], context: PlanDataContext): Promise<SerpRequestOutcome> {
  if (!(await canUseLicensedMetrics(context.actor, context.workspaceId))) {
    return { fresh: new Map(), tasks: [], notice: "PLAN_NO_LICENSED_METRICS", costUsd: 0, requests: 0 };
  }
  const fresh = await readFreshSerps(
    items.map((item) => item.canonical),
    context
  );
  const seen = new Set(fresh.keys());
  const missing = items.filter((item) => !seen.has(item.canonical) && seen.add(item.canonical));
  return { fresh, ...(await postSerpTasks(missing, context)) };
}

/** Raccoglie i task pronti di requestSerps e salva i loro risultati; restituisce quelli ancora in attesa. */
export async function collectSerps(tasks: SerpTask[], context: PlanDataContext): Promise<SerpCollectOutcome> {
  if (!(await canUseLicensedMetrics(context.actor, context.workspaceId))) {
    return { saved: [], pending: [], failed: tasks.map((task) => task.canonical), notice: "PLAN_NO_LICENSED_METRICS" };
  }
  return collectSerpTasks(tasks, context);
}
