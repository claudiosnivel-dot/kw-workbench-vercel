import type { AuthUser } from "@/lib/auth/credentials";
import { AppError } from "@/lib/http/errors";
import { DEFAULT_LOCALE } from "@/lib/i18n/locale";
import { AGENT_INSTRUCTIONS } from "@/lib/modules/agent/instructions";
import type { AgentTool } from "@/lib/modules/agent/tool";
import { getProjectTool, listProjectsTool } from "@/lib/modules/agent/tools/projects";
import { catalogTranslator } from "@/lib/modules/strategy/translator";
import { logger } from "@/lib/observability/logger";
import { prisma } from "@/lib/prisma";
import packageJson from "@/package.json";

// Server MCP di Claude Code (T-7201, D-64): protocollo «Streamable HTTP» senza stato e senza stream, un messaggio
// JSON-RPC 2.0 per richiesta, scritto nel repo senza la libreria ufficiale. Errori di protocollo come errori JSON-RPC,
// errori degli strumenti come risultati con isError.

/** Versioni del protocollo supportate, dalla più recente: initialize risponde con quella chiesta o con la prima. */
export const MCP_PROTOCOL_VERSIONS = ["2025-06-18", "2025-03-26"] as const;

export const JSON_RPC_ERRORS = { parseError: -32700, invalidRequest: -32600, methodNotFound: -32601, invalidParams: -32602 } as const;

/** Registro degli strumenti: tools/list li elenca in quest'ordine, tools/call li cerca per nome. */
const TOOLS: readonly AgentTool[] = [listProjectsTool, getProjectTool];

type JsonRpcId = string | number;

export type JsonRpcResponse =
  | { jsonrpc: "2.0"; id: JsonRpcId; result: unknown }
  | { jsonrpc: "2.0"; id: JsonRpcId | null; error: { code: number; message: string } };

type ToolResult = { content: { type: "text"; text: string }[]; isError?: true };

/** Chi chiama: l'utente e l'id della chiave verificata (verifyAgentKey). */
export type AgentCaller = { user: AuthUser; keyId: string };

export function rpcError(id: JsonRpcId | null, code: number, message: string): JsonRpcResponse {
  return { jsonrpc: "2.0", id, error: { code, message } };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isId(value: unknown): value is JsonRpcId {
  return typeof value === "string" || (typeof value === "number" && Number.isFinite(value));
}

function textResult(data: unknown, isError = false): ToolResult {
  return { content: [{ type: "text", text: JSON.stringify(data) }], ...(isError ? { isError: true as const } : {}) };
}

/** Testo del catalogo per il code, nella lingua delle preferenze dell'utente (italiano se non l'ha scelta). */
function errorMessage(code: string, user: AuthUser): string {
  return catalogTranslator(user.uiLocale ?? DEFAULT_LOCALE)(`errors.${code}`);
}

/**
 * Esegue lo strumento e scrive la riga di agent_calls con strumento, progetto, esito e durata, mai l'input o la
 * risposta (CWE-532). Un AppError diventa { code, message } nella lingua dell'utente con i suoi campi pubblici; un
 * errore inatteso va nei log e al modello arriva solo INTERNAL_ERROR (CWE-209).
 */
async function runTool(tool: AgentTool, args: unknown, caller: AgentCaller): Promise<ToolResult> {
  const started = Date.now();
  const log: { projectId: string | null } = { projectId: null };
  let result: ToolResult;
  let errorCode: string | null = null;
  const recordProject = (projectId: string) => {
    log.projectId = projectId;
  };
  try {
    result = textResult(await tool.call(args, { user: caller.user, recordProject }));
  } catch (error) {
    const appError = error instanceof AppError ? error : null;
    if (!appError) {
      logger.error("agent_tool_failed", { tool: tool.name, error });
    }
    errorCode = appError?.code ?? "INTERNAL_ERROR";
    result = textResult({ ...appError?.fields, code: errorCode, message: errorMessage(errorCode, caller.user) }, true);
  }
  await prisma.agentCall.create({
    data: {
      key_id: caller.keyId,
      tool: tool.name,
      project_id: log.projectId,
      ok: errorCode === null,
      error_code: errorCode,
      duration_ms: Date.now() - started,
    },
  });
  return result;
}

function initializeResult(params: Record<string, unknown>) {
  const requested = MCP_PROTOCOL_VERSIONS.find((version) => version === params.protocolVersion);
  return {
    protocolVersion: requested ?? MCP_PROTOCOL_VERSIONS[0],
    capabilities: { tools: { listChanged: false } },
    serverInfo: { name: "titan-seo", title: "Titan SEO", version: packageJson.version },
    instructions: AGENT_INSTRUCTIONS,
  };
}

/**
 * Risposta a un messaggio JSON-RPC 2.0 del client; null per le notifiche e per le risposte del client, che la rotta
 * accetta con 202 senza corpo. Gli array (batch) non sono supportati: -32600.
 */
export async function handleMcpMessage(message: unknown, caller: AgentCaller): Promise<JsonRpcResponse | null> {
  if (!isRecord(message) || message.jsonrpc !== "2.0") {
    return rpcError(isRecord(message) && isId(message.id) ? message.id : null, JSON_RPC_ERRORS.invalidRequest, "Invalid Request");
  }
  const { id, method, params } = message;
  if (typeof method !== "string") {
    const clientResponse = isId(id) && ("result" in message || "error" in message);
    return clientResponse ? null : rpcError(isId(id) ? id : null, JSON_RPC_ERRORS.invalidRequest, "Invalid Request");
  }
  if (id === undefined) {
    return null;
  }
  if (!isId(id)) {
    return rpcError(null, JSON_RPC_ERRORS.invalidRequest, "Invalid Request");
  }
  if (params !== undefined && !isRecord(params)) {
    return rpcError(id, JSON_RPC_ERRORS.invalidParams, "Invalid params");
  }
  const input = params ?? {};

  switch (method) {
    case "initialize":
      return { jsonrpc: "2.0", id, result: initializeResult(input) };
    case "ping":
      return { jsonrpc: "2.0", id, result: {} };
    case "tools/list":
      return {
        jsonrpc: "2.0",
        id,
        result: { tools: TOOLS.map(({ name, description, inputSchema }) => ({ name, description, inputSchema })) },
      };
    case "tools/call": {
      const tool = typeof input.name === "string" ? TOOLS.find((candidate) => candidate.name === input.name) : undefined;
      if (!tool) {
        return rpcError(id, JSON_RPC_ERRORS.invalidParams, typeof input.name === "string" ? "Unknown tool" : "Invalid params");
      }
      return { jsonrpc: "2.0", id, result: await runTool(tool, input.arguments ?? {}, caller) };
    }
    default:
      return rpcError(id, JSON_RPC_ERRORS.methodNotFound, "Method not found");
  }
}
