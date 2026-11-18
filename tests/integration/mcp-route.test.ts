// Gate di T-7201 (AC-7201-1…5): rotta /api/mcp del server MCP di Claude Code con il protocollo JSON-RPC 2.0, l'accesso
// con la sola chiave del root admin nell'intestazione Authorization, il limite di 120 richieste al minuto per chiave e il
// registro agent_calls di ogni tools/call.
import { NextRequest } from "next/server";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { findAuthUserById } from "@/lib/auth/credentials";
import { createAgentKey, revokeAgentKey } from "@/lib/modules/agent/keys";
import { prisma } from "@/lib/prisma";
import { proxy } from "@/proxy";
import { resetDatabase } from "../helpers/db";
import { callTool, getMcp, type JsonRpcReply, MCP_URL, postMcp, rootAdminWithKey, rpc, type ToolResult } from "../helpers/mcp";

const LIST_PROJECTS_CALL = { jsonrpc: "2.0", id: 7, method: "tools/call", params: { name: "list_projects", arguments: {} } };

beforeAll(() => {
  vi.stubEnv("APP_AUTH_ENABLED", "true");
});

afterAll(() => {
  vi.unstubAllEnvs();
});

beforeEach(async () => {
  await resetDatabase();
});

describe("protocollo MCP su /api/mcp", () => {
  // covers: AC-7201-1
  it("initialize risponde con la versione 2025-06-18, capabilities.tools e le istruzioni; tools/list elenca gli strumenti", async () => {
    const root = await rootAdminWithKey("t7201-init");

    const init = await rpc(root.key, "initialize", {
      protocolVersion: "2025-06-18",
      capabilities: {},
      clientInfo: { name: "claude-code", version: "2.0.0" },
    });

    expect(init.error).toBeUndefined();
    expect(init.id).toBe(1);
    expect(init.result?.protocolVersion).toBe("2025-06-18");
    expect(init.result?.capabilities).toMatchObject({ tools: {} });
    expect(init.result?.serverInfo).toMatchObject({ name: "titan-seo" });
    expect(typeof init.result?.instructions).toBe("string");
    expect(String(init.result?.instructions).trim().length).toBeGreaterThan(0);

    const list = await rpc(root.key, "tools/list", {}, 2);
    const tools = list.result?.tools as { name: string; description: string; inputSchema: { type: string } }[];
    expect(list.id).toBe(2);
    expect(tools.map((tool) => tool.name)).toEqual(expect.arrayContaining(["list_projects", "get_project"]));
    for (const tool of tools) {
      expect(tool.name).toMatch(/^[a-z_]+$/);
      expect(tool.description.length).toBeGreaterThan(0);
      expect(tool.inputSchema.type).toBe("object");
    }
  });

  it("initialize con una versione non supportata risponde con la più recente supportata, con 2025-03-26 la conserva", async () => {
    const root = await rootAdminWithKey("t7201-version");

    const future = await rpc(root.key, "initialize", { protocolVersion: "2099-01-01", capabilities: {}, clientInfo: { name: "x", version: "1" } });
    const older = await rpc(root.key, "initialize", { protocolVersion: "2025-03-26", capabilities: {}, clientInfo: { name: "x", version: "1" } });

    expect(future.result?.protocolVersion).toBe("2025-06-18");
    expect(older.result?.protocolVersion).toBe("2025-03-26");
  });

  // covers: AC-7201-2
  it("senza chiave, con una chiave revocata, con una scaduta e con il solo cookie di sessione risponde 401 e non registra nulla", async () => {
    const root = await rootAdminWithKey("t7201-denied");
    const user = await findAuthUserById(root.user.id);
    if (!user) throw new Error("root admin mancante");
    await revokeAgentKey(user);
    const revoked = root.key;
    const expired = (await createAgentKey(user, { duration: 30 })).key;
    await prisma.agentKey.updateMany({ where: { revoked_at: null }, data: { expires_at: new Date(Date.now() - 1000) } });

    const attempts = [
      await postMcp(null, LIST_PROJECTS_CALL),
      await postMcp(revoked, LIST_PROJECTS_CALL),
      await postMcp(expired, LIST_PROJECTS_CALL),
      await postMcp(null, LIST_PROJECTS_CALL, { cookie: root.cookie }),
    ];

    for (const response of attempts) {
      expect(response.status).toBe(401);
      expect(response.headers.get("www-authenticate")).toMatch(/^Bearer\b/);
    }
    expect(await prisma.agentCall.count()).toBe(0);
  });

  it("la chiave nell'indirizzo invece che nell'intestazione non vale: 401 senza chiamate", async () => {
    const root = await rootAdminWithKey("t7201-url");

    const response = await postMcp(null, LIST_PROJECTS_CALL, { url: `${MCP_URL}?key=${root.key}&access_token=${root.key}` });

    expect(response.status).toBe(401);
    expect(await prisma.agentCall.count()).toBe(0);
  });

  // covers: AC-7201-3
  it("uno strumento inesistente è l'errore -32602; list_projects risponde senza isError e scrive una riga in agent_calls", async () => {
    const root = await rootAdminWithKey("t7201-call");

    const unknown = await rpc(root.key, "tools/call", { name: "delete_everything", arguments: {} }, 3);
    expect(unknown.id).toBe(3);
    expect(unknown.error?.code).toBe(-32602);
    expect(unknown.result).toBeUndefined();

    const { result } = await callTool(root.key, "list_projects");
    expect(result?.isError).not.toBe(true);
    expect(result?.content[0].type).toBe("text");

    const calls = await prisma.agentCall.findMany();
    expect(calls).toHaveLength(1);
    expect(calls[0]).toMatchObject({ tool: "list_projects", ok: true, error_code: null, project_id: null });
    expect(Number.isInteger(calls[0].duration_ms)).toBe(true);
    expect(calls[0].duration_ms).toBeGreaterThanOrEqual(0);
    const key = await prisma.agentKey.findFirstOrThrow({ where: { user_id: root.user.id, revoked_at: null } });
    expect(calls[0].key_id).toBe(key.id);
    expect(key.last_used_at).not.toBeNull();
  });

  // covers: AC-7201-4
  it("la richiesta numero 121 nello stesso minuto risponde 429 con Retry-After", async () => {
    const root = await rootAdminWithKey("t7201-rate");

    for (let index = 1; index <= 120; index += 1) {
      const response = await postMcp(root.key, { jsonrpc: "2.0", id: index, method: "ping" });
      expect(response.status).toBe(200);
    }
    const blocked = await postMcp(root.key, { jsonrpc: "2.0", id: 121, method: "ping" });

    expect(blocked.status).toBe(429);
    expect(Number(blocked.headers.get("retry-after"))).toBeGreaterThanOrEqual(1);
  }, 60_000);

  // covers: AC-7201-5
  it("GET risponde 405; un POST con un corpo che non è JSON risponde con l'errore JSON-RPC -32700", async () => {
    const root = await rootAdminWithKey("t7201-parse");

    const get = await getMcp(root.key);
    expect(get.status).toBe(405);

    const response = await postMcp(root.key, "{ questo non è json");
    const body = (await response.json()) as JsonRpcReply;
    expect(body.jsonrpc).toBe("2.0");
    expect(body.id).toBeNull();
    expect(body.error?.code).toBe(-32700);
  });

  it("le notifiche rispondono 202 senza corpo, un metodo ignoto -32601, una richiesta senza jsonrpc -32600, ping un risultato vuoto", async () => {
    const root = await rootAdminWithKey("t7201-messages");

    const notification = await postMcp(root.key, { jsonrpc: "2.0", method: "notifications/initialized" });
    expect(notification.status).toBe(202);
    expect(await notification.text()).toBe("");

    expect((await rpc(root.key, "resources/list", {}, 4)).error?.code).toBe(-32601);
    const invalid = (await (await postMcp(root.key, { id: 5, method: "ping" })).json()) as JsonRpcReply;
    expect(invalid.error?.code).toBe(-32600);
    expect((await rpc(root.key, "tools/call", { arguments: {} }, 6)).error?.code).toBe(-32602);
    expect((await rpc(root.key, "ping", undefined, 8)).result).toEqual({});
  });

  it("un input non valido di uno strumento è un risultato isError con VALIDATION_ERROR, registrato con ok false", async () => {
    const root = await rootAdminWithKey("t7201-invalid");

    const { result, data } = await callTool(root.key, "get_project", { projectId: 42 });

    expect((result as ToolResult).isError).toBe(true);
    expect(data).toMatchObject({ code: "VALIDATION_ERROR" });
    expect(await prisma.agentCall.findMany({ select: { tool: true, ok: true, error_code: true } })).toEqual([
      { tool: "get_project", ok: false, error_code: "VALIDATION_ERROR" },
    ]);
  });

  it("il proxy lascia arrivare /api/mcp alla rotta anche senza cookie di sessione", async () => {
    const response = await proxy(new NextRequest(new URL(MCP_URL, "http://localhost:3000"), { method: "POST" }));

    expect(response.status).toBe(200);
    expect(response.headers.get("x-middleware-next")).toBe("1");
  });
});
