// Gate di T-7101 (AC-7101-1…4): chiave di Claude Code del root admin con la durata scelta, salvata solo come hash e
// prefisso, una sola attiva, che non vale più se scade, se viene revocata o se l'utente perde il ruolo di root admin;
// rotte /api/admin/agent-key solo per il root admin.
import { createHash } from "node:crypto";
import { UserRole } from "@/lib/generated/prisma/enums";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { DELETE as revokeKey, GET as readKey, POST as createKey } from "@/app/api/admin/agent-key/route";
import { verifyAgentKey } from "@/lib/modules/agent/keys";
import { prisma } from "@/lib/prisma";
import { createUserWithSession } from "../helpers/auth";
import { resetDatabase } from "../helpers/db";
import { callRoute } from "../helpers/http";

type KeyStatusBody = {
  prefix: string;
  createdAt: string;
  expiresAt: string | null;
  lastUsedAt: string | null;
  revokedAt: string | null;
  active: boolean;
};

const DAY_MS = 24 * 60 * 60 * 1000;
const ENDPOINT = "/api/admin/agent-key";

beforeAll(() => {
  vi.stubEnv("APP_AUTH_ENABLED", "true");
});

afterAll(() => {
  vi.unstubAllEnvs();
});

beforeEach(async () => {
  await resetDatabase();
});

function rootAdmin() {
  return createUserWithSession({ displayName: "t7101-root", role: UserRole.ADMIN, isRootAdmin: true });
}

async function postKey(cookie: string | undefined, body: unknown) {
  return callRoute(createKey, { method: "POST", url: ENDPOINT, cookie, body });
}

/** Chiave creata dalla rotta: la stringa in chiaro e lo stato della risposta. */
async function issueKey(cookie: string, duration: number | string): Promise<{ key: string; status: KeyStatusBody }> {
  const response = await postKey(cookie, { duration });
  expect(response.status).toBe(201);
  return ((await response.json()) as { data: { key: string; status: KeyStatusBody } }).data;
}

describe("chiave di Claude Code del root admin", () => {
  // covers: AC-7101-1
  it("con duration 30 risponde 201 con la chiave tsk_ e la scadenza a 30 giorni; il DB ha solo hash e prefisso", async () => {
    const root = await rootAdmin();
    const before = Date.now();

    const response = await postKey(root.cookie, { duration: 30 });
    const body = (await response.json()) as { data: { key: string; status: KeyStatusBody } };

    expect(response.status).toBe(201);
    expect(response.headers.get("cache-control")).toBe("no-store");
    const { key, status } = body.data;
    expect(key.startsWith("tsk_")).toBe(true);
    expect(key).toMatch(/^tsk_[A-Za-z0-9_-]{43}$/);
    const expiresAt = new Date(status.expiresAt ?? "").getTime();
    expect(expiresAt).toBeGreaterThanOrEqual(before + 30 * DAY_MS);
    expect(expiresAt).toBeLessThanOrEqual(Date.now() + 30 * DAY_MS);
    expect(status).toMatchObject({ prefix: key.slice(4, 12), lastUsedAt: null, revokedAt: null, active: true });

    const rows = await prisma.$queryRaw<Record<string, unknown>[]>`SELECT * FROM agent_keys`;
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      user_id: root.user.id,
      prefix: key.slice(4, 12),
      key_hash: createHash("sha256").update(key).digest("hex"),
    });
    const secret = key.slice(4);
    for (const value of Object.values(rows[0])) {
      expect(String(value)).not.toContain(secret);
    }

    const audit = await prisma.adminAuditLog.findMany({ where: { action: "agent_key.create" } });
    expect(audit).toHaveLength(1);
    expect(audit[0]).toMatchObject({ actor_user_id: root.user.id, target_type: "agent_key" });
    expect(JSON.stringify(audit[0].metadata)).not.toContain(secret);
  });

  // covers: AC-7101-2
  it("una seconda chiave B con duration never revoca la prima A: A non vale più, B dà il root admin e non scade", async () => {
    const root = await rootAdmin();
    const first = await issueKey(root.cookie, 30);
    expect((await verifyAgentKey(first.key))?.user.id).toBe(root.user.id);

    const second = await issueKey(root.cookie, "never");

    expect(await verifyAgentKey(first.key)).toBeNull();
    const verified = await verifyAgentKey(second.key);
    expect(verified?.user.id).toBe(root.user.id);
    expect(second.status.expiresAt).toBeNull();
    const row = await prisma.agentKey.findUniqueOrThrow({ where: { id: verified?.keyId ?? "" } });
    expect(row.expires_at).toBeNull();
    expect(await prisma.agentKey.count({ where: { user_id: root.user.id, revoked_at: null } })).toBe(1);

    const read = await callRoute(readKey, { url: ENDPOINT, cookie: root.cookie });
    const status = ((await read.json()) as { data: KeyStatusBody }).data;
    expect(status).toMatchObject({ prefix: second.key.slice(4, 12), expiresAt: null, active: true });
    expect(JSON.stringify(status)).not.toContain(second.key.slice(4));
  });

  // covers: AC-7101-3
  it("la chiave non vale più quando scade, quando viene revocata e quando l'utente perde il ruolo di root admin", async () => {
    const root = await rootAdmin();

    const expiring = await issueKey(root.cookie, 30);
    expect(await verifyAgentKey(expiring.key)).not.toBeNull();
    await prisma.agentKey.updateMany({ where: { revoked_at: null }, data: { expires_at: new Date(Date.now() - 1000) } });
    expect(await verifyAgentKey(expiring.key)).toBeNull();

    const revoked = await issueKey(root.cookie, 90);
    expect(await verifyAgentKey(revoked.key)).not.toBeNull();
    const response = await callRoute(revokeKey, { method: "DELETE", url: ENDPOINT, cookie: root.cookie });
    expect(response.status).toBe(200);
    expect(((await response.json()) as { data: KeyStatusBody }).data).toMatchObject({ active: false });
    expect(await verifyAgentKey(revoked.key)).toBeNull();
    expect(await prisma.adminAuditLog.count({ where: { action: "agent_key.revoke" } })).toBe(1);

    const demoted = await issueKey(root.cookie, "never");
    expect(await verifyAgentKey(demoted.key)).not.toBeNull();
    await prisma.user.update({ where: { id: root.user.id }, data: { is_root_admin: false } });
    expect(await verifyAgentKey(demoted.key)).toBeNull();
  });

  it("rifiuta una chiave sconosciuta, vuota o di un utente sospeso o con il cambio password in sospeso", async () => {
    const root = await rootAdmin();
    const { key } = await issueKey(root.cookie, 60);

    expect(await verifyAgentKey(null)).toBeNull();
    expect(await verifyAgentKey("")).toBeNull();
    expect(await verifyAgentKey(`${key}x`)).toBeNull();
    expect(await verifyAgentKey(key.slice(4))).toBeNull();

    await prisma.user.update({ where: { id: root.user.id }, data: { must_change_password: true } });
    expect(await verifyAgentKey(key)).toBeNull();
    await prisma.user.update({ where: { id: root.user.id }, data: { must_change_password: false, status: "SUSPENDED" } });
    expect(await verifyAgentKey(key)).toBeNull();
  });

  it("due creazioni contemporanee lasciano una sola chiave attiva", async () => {
    const root = await rootAdmin();

    const responses = await Promise.all([postKey(root.cookie, { duration: 30 }), postKey(root.cookie, { duration: 60 })]);

    for (const response of responses) {
      expect([201, 409]).toContain(response.status);
    }
    expect(await prisma.agentKey.count({ where: { user_id: root.user.id, revoked_at: null } })).toBe(1);
  });

  it("rifiuta una durata diversa da 30, 60, 90 o never con 400 e senza righe", async () => {
    const root = await rootAdmin();

    for (const duration of [7, "30", "mai", null]) {
      const response = await postKey(root.cookie, { duration });
      expect(response.status).toBe(400);
    }
    expect(await prisma.agentKey.count()).toBe(0);
  });

  // covers: AC-7101-4
  it("un ADMIN non root e un utente normale ricevono 403 da GET, POST e DELETE e la tabella resta vuota", async () => {
    const admin = await createUserWithSession({ displayName: "t7101-admin", role: UserRole.ADMIN });
    const subscriber = await createUserWithSession({ displayName: "t7101-user" });

    for (const cookie of [admin.cookie, subscriber.cookie]) {
      expect((await callRoute(readKey, { url: ENDPOINT, cookie })).status).toBe(403);
      expect((await postKey(cookie, { duration: 30 })).status).toBe(403);
      expect((await callRoute(revokeKey, { method: "DELETE", url: ENDPOINT, cookie })).status).toBe(403);
    }
    expect((await callRoute(readKey, { url: ENDPOINT })).status).toBe(401);
    expect(await prisma.agentKey.count()).toBe(0);
  });
});
