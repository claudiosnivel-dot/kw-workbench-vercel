import { UserRole } from "@/lib/generated/prisma/enums";
import { GET as mcpGet, POST as mcpPost } from "@/app/api/mcp/route";
import { findAuthUserById } from "@/lib/auth/credentials";
import { createAgentKey } from "@/lib/modules/agent/keys";
import { createUserWithSession } from "./auth";
import { callRoute } from "./http";

/** Indirizzo del server MCP di Claude Code (T-7201). */
export const MCP_URL = "/api/mcp";

export type JsonRpcReply = {
  jsonrpc: "2.0";
  id: string | number | null;
  result?: Record<string, unknown>;
  error?: { code: number; message: string };
};

/** Risultato di tools/call: un solo blocco di testo con il JSON della risposta dello strumento. */
export type ToolResult = { content: { type: string; text: string }[]; isError?: boolean };

/** Root admin con il workspace personale, il cookie di sessione e una chiave di Claude Code valida per 30 giorni. */
export async function rootAdminWithKey(displayName: string) {
  const session = await createUserWithSession({ displayName, role: UserRole.ADMIN, isRootAdmin: true });
  const user = await findAuthUserById(session.user.id);
  if (!user) {
    throw new Error("root admin del test non trovato");
  }
  const { key } = await createAgentKey(user, { duration: 30 });
  return { ...session, key };
}

/** POST /api/mcp con un corpo (oggetto o testo così com'è) e, se c'è, la chiave nell'intestazione Authorization. */
export function postMcp(key: string | null, body: unknown, options: { cookie?: string; url?: string } = {}) {
  return callRoute(mcpPost, {
    method: "POST",
    url: options.url ?? MCP_URL,
    body,
    cookie: options.cookie,
    headers: key ? { authorization: `Bearer ${key}` } : undefined,
  });
}

export const getMcp = (key: string) => callRoute(mcpGet, { url: MCP_URL, headers: { authorization: `Bearer ${key}` } });

/** Richiesta JSON-RPC 2.0 con la risposta già letta. */
export async function rpc(key: string, method: string, params?: unknown, id: number | string = 1): Promise<JsonRpcReply> {
  const response = await postMcp(key, { jsonrpc: "2.0", id, method, ...(params === undefined ? {} : { params }) });
  return (await response.json()) as JsonRpcReply;
}

/** tools/call con la chiave: il risultato dello strumento e il JSON del suo testo. */
export async function callTool(key: string, name: string, args: Record<string, unknown> = {}) {
  const reply = await rpc(key, "tools/call", { name, arguments: args });
  const result = reply.result as ToolResult | undefined;
  return { reply, result, data: result ? (JSON.parse(result.content[0].text) as Record<string, unknown>) : null };
}
