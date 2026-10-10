// Gate di T-1804 (AC-1804-1…4): export dei dati dell'account e cancellazione con password, blocchi e anonimizzazione.
// Gate di T-2001 (AC-2001-1, AC-2001-2): tentativi limitati per utente e riga anonima account.delete nel registro.
// impacted-by: T-2001 (AC-1804-4 emendato: dopo la cancellazione il registro ha una riga in più, account.delete)
import { randomBytes } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DELETE as deleteAccount } from "@/app/api/account/route";
import { GET as exportAccount } from "@/app/api/account/export/route";
import { GET as listWorkspaces } from "@/app/api/workspaces/route";
import { UserRole } from "@/lib/generated/prisma/enums";
import { resetEnvForTests } from "@/lib/env";
import { upsertGoogleSheetsCredential } from "@/lib/integrations/google-sheets";
import { prisma } from "@/lib/prisma";
import { createUserWithSession, TEST_USER_PASSWORD } from "../helpers/auth";
import { seedSubscription } from "../helpers/billing-team";
import { resetDatabase } from "../helpers/db";
import { callRoute } from "../helpers/http";

const REVOKE_URL = "https://oauth2.googleapis.com/revoke";

beforeEach(async () => {
  vi.stubEnv("APP_AUTH_ENABLED", "true");
  vi.stubEnv("APP_ENCRYPTION_KEY", randomBytes(32).toString("hex"));
  resetEnvForTests();
  await resetDatabase();
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  resetEnvForTests();
});

/** Progetto con una sezione, una seed e una keyword nel workspace indicato. */
async function seedProject(workspaceId: string, name: string, userId: string) {
  const project = await prisma.project.create({ data: { workspace_id: workspaceId, name, created_by_user_id: userId } });
  const section = await prisma.subproject.create({ data: { project_id: project.id, name: `${name}-sezione` } });
  await prisma.seed.create({ data: { project_id: project.id, subproject_id: section.id, keyword: `${name}-seed` } });
  await prisma.keywordCandidate.create({
    data: {
      project_id: project.id,
      subproject_id: section.id,
      keyword: `${name}-keyword`,
      normalized_keyword: `${name}-keyword`,
      canonical_keyword: `${name}-keyword`,
      source: "autocomplete",
      source_query: `${name}-seed`,
    },
  });
  return project;
}

const deleteWith = (cookie: string, password: string) =>
  callRoute(deleteAccount, { method: "DELETE", url: "/api/account", cookie, body: { password } });

/** Revoca di Google simulata: conta le chiamate all'endpoint di revoca, nessuna rete. */
function fakeGoogleRevoke() {
  const revoke = vi.fn(async () => new Response(null, { status: 200 }));
  vi.stubGlobal("fetch", async (input: RequestInfo | URL) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
    if (url === REVOKE_URL) return revoke();
    throw new Error(`rete non prevista nel test: ${url}`);
  });
  return revoke;
}

describe("export dei dati dell'account", () => {
  // covers: AC-1804-1
  it("contiene profilo, membership e i progetti dei soli workspace di cui l'utente è unico OWNER, senza segreti", async () => {
    const u = await createUserWithSession({ displayName: "t1804-u" });
    const other = await createUserWithSession({ displayName: "t1804-other" });
    await prisma.membership.create({ data: { workspace_id: other.workspaceId, user_id: u.user.id, role: "MEMBER" } });
    await seedProject(u.workspaceId, "P-U", u.user.id);
    await seedProject(other.workspaceId, "P-Altro", other.user.id);
    await upsertGoogleSheetsCredential({ userId: u.user.id, refreshToken: "token-di-prova-t1804" });

    const response = await callRoute(exportAccount, { url: "/api/account/export", cookie: u.cookie });
    const body = await response.text();

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toContain("application/json");
    expect(response.headers.get("content-disposition")).toMatch(/^attachment; filename="account-export-\d{4}-\d{2}-\d{2}\.json"$/);
    expect(response.headers.get("cache-control")).toBe("no-store");

    const data = JSON.parse(body);
    expect(data.profile.email).toBe("t1804-u@example.test");
    expect(data.memberships).toHaveLength(2);
    expect(data.owned_workspaces.flatMap((workspace: { projects: { name: string }[] }) => workspace.projects.map((p) => p.name))).toEqual(["P-U"]);
    expect(data.owned_workspaces[0].projects[0].sections[0].seeds).toEqual(["P-U-seed"]);
    expect(data.owned_workspaces[0].projects[0].keyword_candidates[0].keyword).toBe("P-U-keyword");
    expect(body).not.toContain("P-Altro");
    expect(body).not.toContain(u.user.password_hash);
    expect(body).not.toContain("refresh_token");
    expect(body).not.toContain("token-di-prova-t1804");
  });
});

describe("cancellazione dell'account", () => {
  // covers: AC-1804-2
  it("l'unico OWNER di un workspace con abbonamento active riceve 409 ACTIVE_SUBSCRIPTION e l'utente resta", async () => {
    const u = await createUserWithSession({ displayName: "t1804-sub" });
    await seedSubscription(u.workspaceId, { status: "active" });

    const response = await deleteWith(u.cookie, TEST_USER_PASSWORD);
    const body = await response.json();

    expect(response.status).toBe(409);
    expect(body.code).toBe("ACTIVE_SUBSCRIPTION");
    expect(body.workspaces.map((workspace: { id: string }) => workspace.id)).toEqual([u.workspaceId]);
    expect(await prisma.user.count({ where: { id: u.user.id } })).toBe(1);
  });

  // covers: AC-1804-3
  it("elimina utente, membership, workspace, progetti e credenziale, revoca il token e la vecchia sessione non vale più", async () => {
    const u = await createUserWithSession({ displayName: "t1804-del" });
    const project = await seedProject(u.workspaceId, "P-Del", u.user.id);
    await upsertGoogleSheetsCredential({ userId: u.user.id, refreshToken: "token-da-revocare-t1804" });
    const revoke = fakeGoogleRevoke();

    const response = await deleteWith(u.cookie, TEST_USER_PASSWORD);

    expect(response.status).toBe(200);
    expect(await prisma.user.count({ where: { id: u.user.id } })).toBe(0);
    expect(await prisma.membership.count({ where: { user_id: u.user.id } })).toBe(0);
    expect(await prisma.workspace.count({ where: { id: u.workspaceId } })).toBe(0);
    expect(await prisma.project.count({ where: { id: project.id } })).toBe(0);
    expect(await prisma.googleSheetsCredential.count({ where: { user_id: u.user.id } })).toBe(0);
    expect(revoke).toHaveBeenCalledTimes(1);

    // GET /api/projects non esiste più da T-1101: la vecchia sessione si prova su GET /api/workspaces.
    const after = await callRoute(listWorkspaces, { url: "/api/workspaces", cookie: u.cookie });
    expect(after.status).toBe(401);
  });

  // covers: AC-1804-4
  it("con la password sbagliata 403 senza cancellare nulla; dopo la cancellazione il registro admin resta anonimo", async () => {
    const admin = await createUserWithSession({ displayName: "t1804-admin", role: UserRole.ADMIN });
    const u = await createUserWithSession({ displayName: "t1804-target" });
    await prisma.adminAuditLog.createMany({
      data: [
        { actor_user_id: admin.user.id, action: "user.create", target_type: "user", target_id: u.user.id, metadata: { role: { before: null, after: "SUBSCRIBER" } } },
        {
          actor_user_id: admin.user.id,
          action: "user.role_change",
          target_type: "user",
          target_id: u.user.id,
          metadata: { note: "t1804-target", email: "t1804-target@example.test", ref: `utente ${u.user.id}` },
        },
      ],
    });
    const auditCount = await prisma.adminAuditLog.count();

    const wrong = await deleteWith(u.cookie, "password-sbagliata");
    expect(wrong.status).toBe(403);
    expect((await wrong.json()).code).toBe("INVALID_PASSWORD");
    expect(await prisma.user.count({ where: { id: u.user.id } })).toBe(1);
    expect(await prisma.adminAuditLog.count()).toBe(auditCount);

    const right = await deleteWith(u.cookie, TEST_USER_PASSWORD);
    expect(right.status).toBe(200);
    const rows = await prisma.adminAuditLog.findMany();
    expect(rows).toHaveLength(auditCount + 1);
    const serialized = JSON.stringify(rows);
    expect(serialized).not.toContain(u.user.id);
    expect(serialized).not.toContain("t1804-target");
    const previous = rows.filter((row) => row.action !== "account.delete");
    expect(previous).toHaveLength(auditCount);
    expect(previous.every((row) => row.actor_user_id === admin.user.id)).toBe(true);
  });

  it("il root admin riceve 409 ROOT_ADMIN e l'unico OWNER di un workspace con altri membri 409 OWNERSHIP_TRANSFER_REQUIRED", async () => {
    const root = await createUserWithSession({ displayName: "t1804-root", role: UserRole.ADMIN, isRootAdmin: true });
    const rootResponse = await deleteWith(root.cookie, TEST_USER_PASSWORD);
    expect(rootResponse.status).toBe(409);
    expect((await rootResponse.json()).code).toBe("ROOT_ADMIN");

    const owner = await createUserWithSession({ displayName: "t1804-owner" });
    const member = await createUserWithSession({ displayName: "t1804-member" });
    await prisma.membership.create({ data: { workspace_id: owner.workspaceId, user_id: member.user.id, role: "MEMBER" } });
    const ownerResponse = await deleteWith(owner.cookie, TEST_USER_PASSWORD);
    const body = await ownerResponse.json();
    expect(ownerResponse.status).toBe(409);
    expect(body.code).toBe("OWNERSHIP_TRANSFER_REQUIRED");
    expect(body.workspaces.map((workspace: { id: string }) => workspace.id)).toEqual([owner.workspaceId]);
    expect(await prisma.user.count({ where: { id: owner.user.id } })).toBe(1);
  });

  it("il workspace personale con un altro OWNER resta ai membri e gli inviti verso l'email spariscono", async () => {
    const u = await createUserWithSession({ displayName: "t1804-heir-from" });
    const heir = await createUserWithSession({ displayName: "t1804-heir" });
    await prisma.membership.create({ data: { workspace_id: u.workspaceId, user_id: heir.user.id, role: "OWNER" } });
    await prisma.workspaceInvite.create({
      data: {
        workspace_id: heir.workspaceId,
        email: "t1804-heir-from@example.test",
        role: "MEMBER",
        token_hash: "a".repeat(64),
        expires_at: new Date(Date.now() + 86_400_000),
      },
    });

    const response = await deleteWith(u.cookie, TEST_USER_PASSWORD);

    expect(response.status).toBe(200);
    const kept = await prisma.workspace.findUnique({ where: { id: u.workspaceId }, select: { personal_for_user_id: true } });
    expect(kept).toEqual({ personal_for_user_id: null });
    expect(await prisma.membership.count({ where: { workspace_id: u.workspaceId } })).toBe(1);
    expect(await prisma.workspaceInvite.count({ where: { email: "t1804-heir-from@example.test" } })).toBe(0);
  });
});

describe("cancellazione dell'account: tentativi e registro (T-2001)", () => {
  // covers: AC-2001-1
  it("con RATE_LIMIT_ACCOUNT_DELETE_MAX = 2 le prime due password sbagliate sono 403 e la terza richiesta è 429 con Retry-After", async () => {
    vi.stubEnv("RATE_LIMIT_ACCOUNT_DELETE_MAX", "2");
    resetEnvForTests();
    const u = await createUserWithSession({ displayName: "t2001-limit" });

    const responses = [];
    for (let attempt = 0; attempt < 3; attempt += 1) {
      responses.push(await deleteWith(u.cookie, "password-sbagliata"));
    }
    const codes = await Promise.all(responses.map(async (response) => ((await response.json()) as { code: string }).code));

    expect(responses.map((response) => response.status)).toEqual([403, 403, 429]);
    expect(codes).toEqual(["INVALID_PASSWORD", "INVALID_PASSWORD", "RATE_LIMITED"]);
    expect(Number(responses[2].headers.get("retry-after"))).toBeGreaterThan(0);
    expect(await prisma.user.count({ where: { id: u.user.id } })).toBe(1);
  });

  // covers: AC-2001-2
  it("dopo la cancellazione il registro ha una riga in più: account.delete senza attore, bersaglio né IP, e nessun dato dell'utente", async () => {
    const admin = await createUserWithSession({ displayName: "t2001-admin", role: UserRole.ADMIN });
    const u = await createUserWithSession({ displayName: "t2001-target" });
    await prisma.adminAuditLog.create({
      data: { actor_user_id: admin.user.id, action: "user.create", target_type: "user", target_id: u.user.id, metadata: { email: "t2001-target@example.test" } },
    });
    const before = await prisma.adminAuditLog.count();

    const response = await deleteWith(u.cookie, TEST_USER_PASSWORD);

    expect(response.status).toBe(200);
    const rows = await prisma.adminAuditLog.findMany({ orderBy: [{ created_at: "asc" }, { id: "asc" }] });
    expect(rows).toHaveLength(before + 1);
    const last = rows[rows.length - 1];
    expect([last.action, last.actor_user_id, last.target_type, last.target_id, last.ip, last.metadata]).toEqual([
      "account.delete",
      null,
      "user",
      null,
      null,
      {},
    ]);
    const serialized = JSON.stringify(rows);
    expect(serialized).not.toContain(u.user.id);
    expect(serialized).not.toContain("t2001-target");
    expect(await prisma.rateLimitHit.count({ where: { key: { contains: u.user.id } } })).toBe(0);
  });
});
