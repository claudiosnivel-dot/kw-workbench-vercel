// Gate di T-1503 (AC-1503-1…4): inviti con token monouso salvato solo come hash, accettazione legata all'email
// verificata del destinatario, gestione dei membri e invariante «il workspace ha sempre un OWNER».
import { createHash } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DELETE as deleteUser } from "@/app/api/admin/users/[id]/route";
import { POST as acceptInvite } from "@/app/api/invites/accept/route";
import { DELETE as revokeInvite } from "@/app/api/workspaces/[workspaceId]/invites/[inviteId]/route";
import { POST as createInvite } from "@/app/api/workspaces/[workspaceId]/invites/route";
import { POST as leaveWorkspace } from "@/app/api/workspaces/[workspaceId]/leave/route";
import { DELETE as removeMember, PATCH as changeRole } from "@/app/api/workspaces/[workspaceId]/members/[userId]/route";
import { POST as transferOwnership } from "@/app/api/workspaces/[workspaceId]/transfer/route";
import { resetEnvForTests } from "@/lib/env";
import type { WorkspaceRole } from "@/lib/generated/prisma/enums";
import { prisma } from "@/lib/prisma";
import { createUserWithSession } from "../helpers/auth";
import { resetDatabase } from "../helpers/db";
import { callRoute } from "../helpers/http";

const DAY_MS = 24 * 60 * 60 * 1000;

function sha256Hex(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

type Session = Awaited<ReturnType<typeof createUserWithSession>>;

/** Workspace di team W (non personale) con i membri indicati. */
async function createTeamWorkspace(members: { session: Session; role: WorkspaceRole }[]) {
  const workspace = await prisma.workspace.create({ data: { name: "Team", slug: `ws-team-${Date.now()}` } });
  for (const { session, role } of members) {
    await prisma.membership.create({ data: { workspace_id: workspace.id, user_id: session.user.id, role } });
  }
  return workspace.id;
}

function inviteAs(session: Session, workspaceId: string, body: unknown) {
  return callRoute(createInvite, {
    method: "POST",
    url: `/api/workspaces/${workspaceId}/invites`,
    body,
    cookie: session.cookie,
    params: { workspaceId },
  });
}

function acceptAs(session: Session, token: string) {
  return callRoute(acceptInvite, { method: "POST", url: "/api/invites/accept", body: { token }, cookie: session.cookie });
}

/** Token in chiaro dal link dell'ultima email di invito per l'indirizzo, letta dall'outbox. */
async function tokenFromOutbox(to: string): Promise<string> {
  const email = await prisma.emailOutbox.findFirstOrThrow({
    where: { to_address: to, template: "workspace-invite" },
    orderBy: { created_at: "desc" },
  });
  const match = /\/invites\/accept\?token=([A-Za-z0-9_-]+)/.exec(email.text);
  expect(match).not.toBeNull();
  return (match as RegExpExecArray)[1];
}

/** Invito scritto direttamente nel DB con un token noto (scaduto o revocato per i casi limite). */
async function insertInvite(workspaceId: string, email: string, token: string, data: { expires_at: Date; revoked_at?: Date }) {
  await prisma.workspaceInvite.create({
    data: { workspace_id: workspaceId, email, role: "MEMBER", token_hash: sha256Hex(token), ...data },
  });
}

beforeEach(async () => {
  vi.stubEnv("APP_AUTH_ENABLED", "true");
  vi.stubEnv("EMAIL_TRANSPORT", "outbox");
  resetEnvForTests();
  await resetDatabase();
});

afterEach(() => {
  vi.unstubAllEnvs();
  resetEnvForTests();
});

describe("creazione degli inviti", () => {
  // covers: AC-1503-1
  it("l'ADMIN invita: 201 senza token, hash SHA-256 nel DB, scadenza a 7 giorni ed email con il link; il MEMBER riceve 403", async () => {
    const owner = await createUserWithSession({ displayName: "t1503-owner" });
    const admin = await createUserWithSession({ displayName: "t1503-admin" });
    const member = await createUserWithSession({ displayName: "t1503-member" });
    const workspaceId = await createTeamWorkspace([
      { session: owner, role: "OWNER" },
      { session: admin, role: "ADMIN" },
      { session: member, role: "MEMBER" },
    ]);
    expect(await prisma.emailOutbox.count()).toBe(0);

    const created = await inviteAs(admin, workspaceId, { email: "Nuovo@Example.com", role: "MEMBER" });

    expect(created.status).toBe(201);
    const body = (await created.json()) as { data: Record<string, unknown> };
    expect(Object.keys(body.data).sort()).toEqual(["email", "expiresAt", "id", "role"]);
    expect(JSON.stringify(body)).not.toMatch(/token/i);
    const rows = await prisma.workspaceInvite.findMany();
    expect(rows).toHaveLength(1);
    expect(rows[0].email).toBe("nuovo@example.com");
    expect(rows[0].token_hash).toMatch(/^[0-9a-f]{64}$/);
    expect(rows[0].expires_at.getTime() - rows[0].created_at.getTime()).toBe(7 * DAY_MS);
    const outbox = await prisma.emailOutbox.findMany();
    expect(outbox).toHaveLength(1);
    expect(outbox[0].to_address).toBe("nuovo@example.com");
    expect(sha256Hex(await tokenFromOutbox("nuovo@example.com"))).toBe(rows[0].token_hash);

    const denied = await inviteAs(member, workspaceId, { email: "altro@example.com", role: "MEMBER" });
    expect(denied.status).toBe(403);
    expect(((await denied.json()) as { code: string }).code).toBe("FORBIDDEN");
    expect(await prisma.workspaceInvite.count()).toBe(1);
  });

  it("409 INVITE_PENDING per un invito già pendente e ALREADY_MEMBER per l'email di un membro; la revoca libera l'email", async () => {
    const owner = await createUserWithSession({ displayName: "t1503-dup-owner" });
    const member = await createUserWithSession({ displayName: "t1503-dup-member" });
    const workspaceId = await createTeamWorkspace([
      { session: owner, role: "OWNER" },
      { session: member, role: "MEMBER" },
    ]);

    const first = await inviteAs(owner, workspaceId, { email: "dup@example.com", role: "ADMIN" });
    const again = await inviteAs(owner, workspaceId, { email: "DUP@example.com", role: "MEMBER" });
    const ofMember = await inviteAs(owner, workspaceId, { email: member.user.email, role: "MEMBER" });
    const asOwner = await inviteAs(owner, workspaceId, { email: "boss@example.com", role: "OWNER" });

    expect(first.status).toBe(201);
    expect(((await again.json()) as { code: string }).code).toBe("INVITE_PENDING");
    expect(((await ofMember.json()) as { code: string }).code).toBe("ALREADY_MEMBER");
    expect(asOwner.status).toBe(400);

    const { data } = (await first.json()) as { data: { id: string } };
    const revoked = await callRoute(revokeInvite, {
      method: "DELETE",
      url: `/api/workspaces/${workspaceId}/invites/${data.id}`,
      cookie: owner.cookie,
      params: { workspaceId, inviteId: data.id },
    });
    expect(revoked.status).toBe(200);
    expect((await inviteAs(owner, workspaceId, { email: "dup@example.com", role: "MEMBER" })).status).toBe(201);
  });
});

describe("accettazione degli inviti", () => {
  // covers: AC-1503-2
  it("il destinatario verificato accetta una volta sola: la seconda richiesta riceve 410 INVITE_INVALID", async () => {
    const owner = await createUserWithSession({ displayName: "t1503-acc-owner" });
    const workspaceId = await createTeamWorkspace([{ session: owner, role: "OWNER" }]);
    await inviteAs(owner, workspaceId, { email: "nuovo@example.com", role: "ADMIN" });
    const token = await tokenFromOutbox("nuovo@example.com");
    const invitee = await createUserWithSession({ displayName: "nuovo", email: "nuovo@example.com" });

    const first = await acceptAs(invitee, token);
    const second = await acceptAs(invitee, token);

    expect(first.status).toBe(200);
    expect(first.headers.get("set-cookie")).toContain(`kwb_workspace=${workspaceId}`);
    const memberships = await prisma.membership.findMany({ where: { workspace_id: workspaceId, user_id: invitee.user.id } });
    expect(memberships).toEqual([expect.objectContaining({ role: "ADMIN" })]);
    expect((await prisma.workspaceInvite.findFirstOrThrow()).accepted_at).not.toBeNull();
    expect(second.status).toBe(410);
    expect(((await second.json()) as { code: string }).code).toBe("INVITE_INVALID");
    expect(await prisma.membership.count({ where: { workspace_id: workspaceId, user_id: invitee.user.id } })).toBe(1);
  });

  // covers: AC-1503-3
  it("email diversa 403 INVITE_EMAIL_MISMATCH; invito scaduto o revocato 410 INVITE_INVALID; nessuna membership nuova", async () => {
    const owner = await createUserWithSession({ displayName: "t1503-lim-owner" });
    const workspaceId = await createTeamWorkspace([{ session: owner, role: "OWNER" }]);
    await inviteAs(owner, workspaceId, { email: "nuovo@example.com", role: "MEMBER" });
    const validToken = await tokenFromOutbox("nuovo@example.com");
    const now = Date.now();
    await insertInvite(workspaceId, "nuovo@example.com", "token-scaduto-1503", { expires_at: new Date(now - 1000) });
    await insertInvite(workspaceId, "nuovo@example.com", "token-revocato-1503", {
      expires_at: new Date(now + DAY_MS),
      revoked_at: new Date(now - 1000),
    });
    const other = await createUserWithSession({ displayName: "altro", email: "altro@example.com" });
    const invitee = await createUserWithSession({ displayName: "nuovo", email: "nuovo@example.com" });
    const before = await prisma.membership.count();

    const mismatch = await acceptAs(other, validToken);
    const expired = await acceptAs(invitee, "token-scaduto-1503");
    const revoked = await acceptAs(invitee, "token-revocato-1503");

    expect([mismatch.status, ((await mismatch.json()) as { code: string }).code]).toEqual([403, "INVITE_EMAIL_MISMATCH"]);
    expect([expired.status, ((await expired.json()) as { code: string }).code]).toEqual([410, "INVITE_INVALID"]);
    expect([revoked.status, ((await revoked.json()) as { code: string }).code]).toEqual([410, "INVITE_INVALID"]);
    expect(await prisma.membership.count()).toBe(before);
  });

  it("con l'email non verificata l'accettazione risponde 403 EMAIL_NOT_VERIFIED e l'invito resta valido", async () => {
    const owner = await createUserWithSession({ displayName: "t1503-unv-owner" });
    const workspaceId = await createTeamWorkspace([{ session: owner, role: "OWNER" }]);
    await inviteAs(owner, workspaceId, { email: "nuovo@example.com", role: "MEMBER" });
    const token = await tokenFromOutbox("nuovo@example.com");
    const invitee = await createUserWithSession({ displayName: "nuovo", email: "nuovo@example.com", emailVerified: false });

    const response = await acceptAs(invitee, token);

    expect([response.status, ((await response.json()) as { code: string }).code]).toEqual([403, "EMAIL_NOT_VERIFIED"]);
    expect((await prisma.workspaceInvite.findFirstOrThrow()).accepted_at).toBeNull();
  });
});

describe("membri e ultimo OWNER", () => {
  // covers: AC-1503-4
  it("l'ultimo OWNER non esce; dopo il trasferimento il cedente è ADMIN e può uscire, e resta un OWNER", async () => {
    const owner = await createUserWithSession({ displayName: "t1503-own" });
    const member = await createUserWithSession({ displayName: "t1503-mem" });
    const workspaceId = await createTeamWorkspace([
      { session: owner, role: "OWNER" },
      { session: member, role: "MEMBER" },
    ]);
    const leave = () =>
      callRoute(leaveWorkspace, { method: "POST", url: `/api/workspaces/${workspaceId}/leave`, cookie: owner.cookie, params: { workspaceId } });

    const firstLeave = await leave();
    expect([firstLeave.status, ((await firstLeave.json()) as { code: string }).code]).toEqual([409, "LAST_OWNER"]);
    expect(await prisma.membership.count({ where: { workspace_id: workspaceId, user_id: owner.user.id } })).toBe(1);

    const transferred = await callRoute(transferOwnership, {
      method: "POST",
      url: `/api/workspaces/${workspaceId}/transfer`,
      body: { userId: member.user.id },
      cookie: owner.cookie,
      params: { workspaceId },
    });
    expect(transferred.status).toBe(200);
    const roles = await prisma.membership.findMany({ where: { workspace_id: workspaceId }, select: { user_id: true, role: true } });
    expect(Object.fromEntries(roles.map((row) => [row.user_id, row.role]))).toEqual({
      [owner.user.id]: "ADMIN",
      [member.user.id]: "OWNER",
    });

    const secondLeave = await leave();
    expect(secondLeave.status).toBe(200);
    expect(await prisma.membership.count({ where: { workspace_id: workspaceId, role: "OWNER" } })).toBe(1);
    expect(await prisma.membership.count({ where: { workspace_id: workspaceId, user_id: owner.user.id } })).toBe(0);
  });

  it("un ADMIN non modifica né rimuove l'OWNER; nessuno esce dal proprio workspace personale", async () => {
    const owner = await createUserWithSession({ displayName: "t1503-o" });
    const admin = await createUserWithSession({ displayName: "t1503-a" });
    const workspaceId = await createTeamWorkspace([
      { session: owner, role: "OWNER" },
      { session: admin, role: "ADMIN" },
    ]);
    const memberUrl = `/api/workspaces/${workspaceId}/members/${owner.user.id}`;
    const params = { workspaceId, userId: owner.user.id };

    const demoted = await callRoute(changeRole, { method: "PATCH", url: memberUrl, body: { role: "MEMBER" }, cookie: admin.cookie, params });
    const removed = await callRoute(removeMember, { method: "DELETE", url: memberUrl, cookie: admin.cookie, params });
    const personal = await callRoute(leaveWorkspace, {
      method: "POST",
      url: `/api/workspaces/${admin.workspaceId}/leave`,
      cookie: admin.cookie,
      params: { workspaceId: admin.workspaceId },
    });

    expect(demoted.status).toBe(403);
    expect(removed.status).toBe(403);
    expect([personal.status, ((await personal.json()) as { code: string }).code]).toEqual([409, "LAST_OWNER"]);
    expect(await prisma.membership.count({ where: { workspace_id: workspaceId, role: "OWNER" } })).toBe(1);
  });

  it("l'admin non elimina l'unico OWNER di un workspace di altri (409 LAST_OWNER); dopo il trasferimento sì", async () => {
    const root = await createUserWithSession({ displayName: "t1503-root", role: "ADMIN", isRootAdmin: true });
    const owner = await createUserWithSession({ displayName: "t1503-solo-owner" });
    const member = await createUserWithSession({ displayName: "t1503-heir" });
    const workspaceId = await createTeamWorkspace([
      { session: owner, role: "OWNER" },
      { session: member, role: "MEMBER" },
    ]);
    const remove = () =>
      callRoute(deleteUser, { method: "DELETE", url: `/api/admin/users/${owner.user.id}`, cookie: root.cookie, params: { id: owner.user.id } });

    const blocked = await remove();
    expect([blocked.status, ((await blocked.json()) as { code: string }).code]).toEqual([409, "LAST_OWNER"]);
    expect(await prisma.user.count({ where: { id: owner.user.id } })).toBe(1);

    await prisma.membership.update({
      where: { workspace_id_user_id: { workspace_id: workspaceId, user_id: member.user.id } },
      data: { role: "OWNER" },
    });
    expect((await remove()).status).toBe(200);
    expect(await prisma.workspace.count({ where: { id: owner.workspaceId } })).toBe(0);
    expect(await prisma.membership.count({ where: { workspace_id: workspaceId, role: "OWNER" } })).toBe(1);
  });
});
