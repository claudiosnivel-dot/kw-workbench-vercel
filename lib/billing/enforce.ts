import { getEntitlements } from "@/lib/billing/entitlements";
import { isCommercialLive } from "@/lib/billing/launch";
import type { CountLimitKey, EntitlementLimits, FeatureKey } from "@/lib/billing/plans";
import type { Prisma } from "@/lib/generated/prisma/client";
import type { MetricsProvider } from "@/lib/generated/prisma/enums";
import { AppError } from "@/lib/http/errors";
import { lockWorkspaceRow } from "@/lib/workspaces/lock";

/**
 * Applicazione dei diritti del piano lato server (T-1605). Il piano arriva solo da getEntitlements(workspaceId): campi
 * plan, limits o entitlements inviati dal client non contano mai (CWE-602). Si chiama dopo il controllo di accesso,
 * quindi un non membro riceve il 404 della risorsa e non scopre piano né limiti (CWE-284). Con il lancio in pausa i
 * diritti sono illimitati e nessun controllo scatta (D-32).
 */

/** 402 PLAN_LIMIT con il nome del limite (e il massimo per i limiti di conteggio), tradotto da withApiErrors. */
export class PlanLimitError extends AppError {
  constructor(limit: CountLimitKey | FeatureKey, max?: number) {
    super(402, "PLAN_LIMIT", "Limite del piano raggiunto", max === undefined ? { limit } : { limit, max });
    this.name = "PlanLimitError";
  }
}

/**
 * Diritti del workspace letti prima della transazione della scrittura: dentro la transazione restano solo il lock e i
 * conteggi, senza chiedere un'altra connessione al pool mentre la transazione tiene la sua.
 */
export type PlanGuard = { workspaceId: string; limits: EntitlementLimits };

export async function loadPlanGuard(workspaceId: string): Promise<PlanGuard> {
  return { workspaceId, limits: (await getEntitlements(workspaceId)).limits };
}

type Count = () => Promise<number> | number;

/**
 * Limite di conteggio nella transazione della scrittura: lock della riga del workspace, poi il conteggio risultante
 * (countAfter, con la scrittura richiesta compresa), così due richieste concorrenti non superano il limite (CWE-362).
 * Con countBefore una modifica che non aumenta il conteggio passa anche oltre il limite: dopo un downgrade i dati oltre
 * limite restano modificabili e si bloccano solo le nuove aggiunte.
 */
export async function assertWithinLimit(
  tx: Prisma.TransactionClient,
  guard: PlanGuard,
  limitKey: CountLimitKey,
  countAfter: Count,
  countBefore?: Count
): Promise<void> {
  const max = guard.limits[limitKey];
  if (max === null) {
    return;
  }
  await lockWorkspaceRow(tx, guard.workspaceId);
  const after = await countAfter();
  if (after > max && (countBefore === undefined || after > (await countBefore()))) {
    throw new PlanLimitError(limitKey, max);
  }
}

/** Funzione a pagamento del piano (export Sheets, import Planner, metriche con licenza): assente → 402. */
export async function assertFeature(workspaceId: string, featureKey: FeatureKey): Promise<void> {
  if (!(await getEntitlements(workspaceId)).limits[featureKey]) {
    throw new PlanLimitError(featureKey);
  }
}

/**
 * Posti del workspace: membership più inviti pendenti, con il posto richiesto (un nuovo invito o una nuova membership),
 * sotto il lock della riga del workspace.
 */
export async function assertSeatAvailable(tx: Prisma.TransactionClient, guard: PlanGuard): Promise<void> {
  const now = new Date();
  await assertWithinLimit(tx, guard, "seats", async () => {
    const members = await tx.membership.count({ where: { workspace_id: guard.workspaceId } });
    const invites = await tx.workspaceInvite.count({
      where: { workspace_id: guard.workspaceId, accepted_at: null, revoked_at: null, expires_at: { gt: now } },
    });
    return members + invites + 1;
  });
}

/**
 * Scelta del fornitore di metriche con licenza (DATAFORSEO, D-30) su progetto o sezione: chi lo ha già lo conserva. Con
 * il lancio in pausa resta del solo root admin (T-902: 403 FORBIDDEN_FIELD); con il lancio attivo lo decide il diritto
 * licensedMetrics del piano del workspace (402 PLAN_LIMIT).
 */
export async function assertLicensedMetricsChoice(
  actor: { isRootAdmin: boolean },
  workspaceId: string,
  chosen: MetricsProvider | null | undefined,
  current: MetricsProvider | null | undefined
): Promise<void> {
  if (chosen !== "DATAFORSEO" || chosen === current) {
    return;
  }
  if (await isCommercialLive()) {
    await assertFeature(workspaceId, "licensedMetrics");
  } else if (!actor.isRootAdmin) {
    throw new AppError(403, "FORBIDDEN_FIELD", "Il provider di metriche DATAFORSEO è riservato all'amministratore principale");
  }
}

/**
 * Limiti dell'estrazione letti all'avvio e salvati nel payload del job (T-1605, T-1703): tetto di keyword salvate,
 * accesso alle metriche con licenza e quote mensili di keyword salvate e arricchite (null = nessuna quota, lancio in
 * pausa).
 */
export type ExtractionPlanLimits = {
  maxKeywordsPerRun: number | null;
  licensedMetrics: boolean;
  keywordsPerMonth?: number | null;
  licensedMetricsKeywordsPerMonth?: number | null;
};

/** Limiti del job e avvii al giorno del workspace (la quota riservata all'avvio, T-1703). */
export async function extractionPlanLimits(workspaceId: string): Promise<ExtractionPlanLimits & { runsPerDay: number | null }> {
  const { limits } = await getEntitlements(workspaceId);
  return {
    maxKeywordsPerRun: limits.maxKeywordsPerRun,
    licensedMetrics: limits.licensedMetrics,
    keywordsPerMonth: limits.keywordsPerMonth,
    licensedMetricsKeywordsPerMonth: limits.licensedMetricsKeywordsPerMonth,
    runsPerDay: limits.runsPerDay,
  };
}
