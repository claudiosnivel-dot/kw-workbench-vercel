import { canUseLicensedMetrics } from "@/lib/billing/enforce";
import type { MetricsContext, MetricsItem } from "@/lib/modules/providers/metrics/types";
import {
  collectSerpTasks,
  isGoogleGotoUrl,
  postSerpTasks,
  type SerpCollectOutcome,
  type SerpPostOutcome,
  type SerpResult,
  type SerpTask,
  withoutTrackingParams,
} from "@/lib/modules/providers/serp/dataforseo-serp";
import { prisma } from "@/lib/prisma";

// Risultati di Google per il piano (T-6101, D-57): quelli salvati da meno di 30 giorni si riusano, gli altri si chiedono
// a DataForSEO. Solo chi può usare i dati con licenza (D-30, canUseLicensedMetrics) fa partire richieste; gli altri
// ricevono PLAN_NO_LICENSED_METRICS e il piano usa il motore di oggi (modulo 62). Claude Code legge i risultati salvati,
// senza richieste, con readSavedSerps (T-7402).

/** Età massima dei risultati salvati: oltre, una keyword si chiede di nuovo a DataForSEO. */
export const SERP_MAX_AGE_DAYS = 30;
const DAY_MS = 86_400_000;

/** Contesto delle richieste per il piano: lingua e paese, progetto e lavoro per il registro, chi chiede e il suo workspace. */
export type PlanDataContext = MetricsContext & { actor: { isRootAdmin: boolean }; workspaceId: string };

export type SerpRequestOutcome = SerpPostOutcome & {
  /** URL salvati da meno di 30 giorni, per forma canonica: queste keyword non sono state inviate. */
  fresh: Map<string, string[]>;
};

/** Lingua e paese dei risultati salvati. */
type SerpLocale = Pick<MetricsContext, "languageCode" | "countryCode">;

/** Righe di keyword_serps delle forme canoniche nella lingua e nel paese indicati. */
function serpRowsWhere(canonicals: string[], context: SerpLocale) {
  return {
    language_code: context.languageCode.toLowerCase(),
    country_code: context.countryCode.toUpperCase(),
    canonical_keyword: { in: [...new Set(canonicals)] },
  };
}

/**
 * Risultati salvati da meno di SERP_MAX_AGE_DAYS giorni per le forme canoniche, nella lingua e nel paese indicati. Le righe
 * con link goto di Google, salvate prima di T-6504, non valgono: le loro keyword si chiedono di nuovo; gli URL tornano
 * senza i parametri di tracciamento (srsltid), anche quelli salvati prima.
 */
export async function readFreshSerps(canonicals: string[], context: SerpLocale, now: Date = new Date()): Promise<Map<string, string[]>> {
  if (canonicals.length === 0) {
    return new Map();
  }
  const rows = await prisma.keywordSerp.findMany({
    where: { ...serpRowsWhere(canonicals, context), fetched_at: { gt: new Date(now.getTime() - SERP_MAX_AGE_DAYS * DAY_MS) } },
    select: { canonical_keyword: true, urls: true },
  });
  return new Map(
    rows.filter((row) => !row.urls.some(isGoogleGotoUrl)).map((row) => [row.canonical_keyword, row.urls.map(withoutTrackingParams)])
  );
}

/** Risultati salvati di una keyword con la data della riga (T-7402). */
type SavedSerp = { fetchedAt: Date; results: SerpResult[] };

/** Elemento di keyword_serps.results letto dal DB: solo le forme salvate da collectSerpTasks, il resto si scarta. */
function savedResult(value: unknown): SerpResult[] {
  if (typeof value !== "object" || value === null) return [];
  const { url, title, description } = value as Record<string, unknown>;
  if (typeof url !== "string") return [];
  return [{ url, title: typeof title === "string" ? title : null, description: typeof description === "string" ? description : null }];
}

/**
 * Risultati salvati delle forme canoniche nella lingua e nel paese indicati, di ogni età, con la data della riga
 * (T-7402): da results con titolo e descrizione o, per le righe salvate prima di T-7401, dagli urls con titolo e
 * descrizione null. Come in readFreshSerps i link goto rimasti si tolgono e gli URL perdono srsltid. Nessuna chiamata.
 */
export async function readSavedSerps(canonicals: string[], context: SerpLocale): Promise<Map<string, SavedSerp>> {
  const rows = await prisma.keywordSerp.findMany({
    where: serpRowsWhere(canonicals, context),
    select: { canonical_keyword: true, urls: true, results: true, fetched_at: true },
  });
  return new Map(
    rows.map((row) => {
      const results = Array.isArray(row.results)
        ? row.results.flatMap(savedResult)
        : row.urls.map((url) => ({ url, title: null, description: null }));
      const direct = results.filter((result) => !isGoogleGotoUrl(result.url)).map((result) => ({ ...result, url: withoutTrackingParams(result.url) }));
      return [row.canonical_keyword, { fetchedAt: row.fetched_at, results: direct }];
    })
  );
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
