import type { AuthUser } from "@/lib/auth/credentials";
import { AGENT_ACTIVITY_LIMIT, type AgentActivity, type AgentCallView } from "@/lib/modules/agent/key-types";
import { readAgentSpend } from "@/lib/modules/agent/spend";
import { prisma } from "@/lib/prisma";

// Attività di Claude Code per il root admin (T-7602, D-64): quello che il registro agent_calls tiene delle chiamate
// fatte con le sue chiavi e la spesa di oggi dei lavori avviati dal server MCP con il tetto (T-7302).

/** Ultime 50 chiamate delle chiavi dell'utente, dalla più recente; il progetto cancellato non c'è più (SetNull). */
async function readAgentCalls(user: Pick<AuthUser, "id">): Promise<AgentCallView[]> {
  const rows = await prisma.agentCall.findMany({
    where: { key: { user_id: user.id } },
    orderBy: [{ created_at: "desc" }, { id: "desc" }],
    take: AGENT_ACTIVITY_LIMIT,
    select: { id: true, tool: true, ok: true, error_code: true, duration_ms: true, created_at: true, project: { select: { id: true, name: true } } },
  });
  return rows.map((row) => ({
    id: row.id,
    at: row.created_at.toISOString(),
    tool: row.tool,
    project: row.project,
    ok: row.ok,
    errorCode: row.error_code,
    durationMs: row.duration_ms,
  }));
}

/** Ultime chiamate e spesa di oggi con il tetto: la rotta e la pagina lo danno solo al root admin (CWE-285). */
export async function readAgentActivity(user: Pick<AuthUser, "id">): Promise<AgentActivity> {
  const [calls, spend] = await Promise.all([readAgentCalls(user), readAgentSpend()]);
  return { calls, spend };
}
