import { writeAuditLog } from "@/lib/admin/audit";
import { AppError, ValidationError } from "@/lib/http/errors";
import { getManySettingValues, upsertSettingValue } from "@/lib/integrations/app-settings";
import { AGENT_DAILY_CAP_DEFAULT_USD, AGENT_DAILY_CAP_MAX_USD, type AgentSpend } from "@/lib/modules/agent/key-types";
import { agentSpendToday } from "@/lib/modules/providers/metrics/metrics-ledger";
import { prisma } from "@/lib/prisma";

// Tetto giornaliero della spesa di Claude Code (T-7302, D-65): conta le richieste a pagamento dei lavori che avvia dal
// server MCP e si controlla prima di avviarne uno. I tetti di spesa della piattaforma (T-903) restano.

const CAP_SETTING_KEY = "AGENT_DAILY_CAP_USD";

/** Importo con al massimo due decimali, da 0 a AGENT_DAILY_CAP_MAX_USD. */
function isValidCap(value: unknown): value is number {
  return (
    typeof value === "number" &&
    Number.isFinite(value) &&
    value >= 0 &&
    value <= AGENT_DAILY_CAP_MAX_USD &&
    Math.abs(Math.round(value * 100) - value * 100) < 1e-6
  );
}

/** Tetto salvato fra le impostazioni dell'amministrazione; assente o illeggibile vale il default di 2 $ (D-65). */
export async function readAgentDailyCap(): Promise<number> {
  const raw = (await getManySettingValues([CAP_SETTING_KEY]))[CAP_SETTING_KEY];
  const value = raw === undefined ? undefined : Number(raw);
  return isValidCap(value) ? value : AGENT_DAILY_CAP_DEFAULT_USD;
}

/** Spesa di oggi (giorno UTC) e tetto, riportati nelle risposte degli strumenti che avviano lavori e nella card. */
export async function readAgentSpend(now: Date = new Date()): Promise<AgentSpend> {
  const [spentTodayUsd, capUsd] = await Promise.all([agentSpendToday(now), readAgentDailyCap()]);
  return { spentTodayUsd, capUsd };
}

/**
 * Controllo prima di avviare un lavoro di Claude Code: con la spesa di oggi uguale o sopra il tetto 429 AGENT_SPEND_CAP
 * con spesa e tetto (un tetto di 0 ferma ogni avvio), altrimenti la spesa da riportare nella risposta.
 */
export async function assertAgentSpendAllowed(now: Date = new Date()): Promise<AgentSpend> {
  const spend = await readAgentSpend(now);
  if (spend.spentTodayUsd >= spend.capUsd) {
    throw new AppError(429, "AGENT_SPEND_CAP", "Tetto giornaliero di spesa di Claude Code raggiunto", { ...spend });
  }
  return spend;
}

/**
 * Nuovo tetto dalla card «Claude Code» (solo il root admin, verificato dalla rotta): { dailyCapUsd } da 0 a 100 con al
 * massimo due decimali, altrimenti 400. Salvato con la riga agent_key.settings del registro, con il tetto prima e dopo.
 */
export async function setAgentDailyCap(actor: { id: string }, input: unknown, ip: string | null = null): Promise<AgentSpend> {
  const value = (input as { dailyCapUsd?: unknown } | null)?.dailyCapUsd;
  if (!isValidCap(value)) {
    throw new ValidationError(`dailyCapUsd deve essere un importo da 0 a ${AGENT_DAILY_CAP_MAX_USD} con al massimo due decimali`);
  }
  const before = await readAgentDailyCap();
  await prisma.$transaction([
    upsertSettingValue({ key: CAP_SETTING_KEY, value: String(value) }),
    writeAuditLog(prisma, {
      actorUserId: actor.id,
      action: "agent_key.settings",
      targetType: "agent_key",
      metadata: { dailyCapUsd: { before, after: value } },
      ip,
    }),
  ]);
  return readAgentSpend();
}
