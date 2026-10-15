// Gate di T-3201 (AC-3201-1…3): l'invito restituisce a chi invita il link da copiare, una sola volta, e l'email parte
// solo quando l'invio è disponibile. Gate di T-3202 (AC-3202-1, AC-3202-2): «Nuovo link» sostituisce il token di un
// invito aperto, anche scaduto, e il vecchio link smette di valere.
import { createHash } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { POST as acceptInvite } from "@/app/api/invites/accept/route";
import { POST as renewInvite } from "@/app/api/workspaces/[workspaceId]/invites/[inviteId]/renew/route";
import { POST as createInvite } from "@/app/api/workspaces/[workspaceId]/invites/route";
import { resetEnvForTests } from "@/lib/env";
import type { WorkspaceRole } from "@/lib/generated/prisma/enums";
import { prisma } from "@/lib/prisma";
import { createUserWithSession } from "../helpers/auth";
import { resetDatabase } from "../helpers/db";
import { callRoute } from "../helpers/http";

const DAY_MS = 24 * 60 * 60 * 1000;

type Session = Awaited<ReturnType<typeof createUserWithSession>>;
type Issued = { data: { id: string; inviteUrl: string; emailSent: boolean } };

function sha256Hex(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

/** Token in chiaro dal link restituito a chi invita. */
function tokenOf(inviteUrl: string): string {
  return new URL(inviteUrl).searchParams.get("token") ?? "";
}

async function createTeamWorkspace(members: { session: Session; role: WorkspaceRole }[]) {
  const workspace = await prisma.workspace.create({ data: { name: "Team", slug: `ws-link-${Date.now()}` } });
  for (const { session, role } of members) {
    await prisma.membership.create({ data: { workspace_id: workspace.id, user_id: session.user.id, role } });
  }
  return workspace.id;
}

function inviteAs(session: Session, workspaceId: string, email: string) {
  return callRoute(createInvite, {
    method: "POST",
    url: `/api/workspaces/${workspaceId}/invites`,
    body: { email, role: "MEMBER" },
    cookie: session.cookie,
    params: { workspaceId },
  });
}

function renewAs(session: Session, workspaceId: string, inviteId: string) {
  return callRoute(renewInvite, {
    method: "POST",
    url: `/api/workspaces/${workspaceId}/invites/${inviteId}/renew`,
    cookie: session.cookie,
    params: { workspaceId, inviteId },
  });
}

function acceptAs(session: Session, token: string) {
  return callRoute(acceptInvite, { method: "POST", url: "/api/invites/accept", body: { token }, cookie: session.cookie });
}

/** Invito scritto nel DB con un token noto; data sceglie scadenza, accettazione o revoca. */
function insertInvite(
  workspaceId: string,
  email: string,
  token: string,
  data: { expires_at: Date; accepted_at?: Date; revoked_at?: Date }
) {
  return prisma.workspaceInvite.create({
    data: { workspace_id: workspaceId, email, role: "MEMBER", token_hash: sha256Hex(token), ...data },
  });
}

async function codeOf(response: Response): Promise<[number, string]> {
  return [response.status, ((await response.json()) as { code: string }).code];
}

beforeEach(async () => {
  vi.stubEnv("APP_AUTH_ENABLED", "true");
  vi.stubEnv("EMAIL_TRANSPORT", "outbox");
  resetEnvForTests();
  await resetDatabase();
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
  resetEnvForTests();
});

describe("link dell'invito (T-3201)", () => {
  // covers: AC-3201-1
  it("201 no-store con il link il cui token ha l'hash della riga, la stessa email nell'outbox e nessun token nei log", async () => {
    const owner = await createUserWithSession({ displayName: "t3201-owner" });
    const admin = await createUserWithSession({ displayName: "t3201-admin" });
    const workspaceId = await createTeamWorkspace([
      { session: owner, role: "OWNER" },
      { session: admin, role: "ADMIN" },
    ]);
    vi.stubEnv("LOG_LEVEL", "debug");
    resetEnvForTests();
    const logLines: string[] = [];
    vi.spyOn(process.stdout, "write").mockImplementation((chunk: string | Uint8Array) => {
      logLines.push(String(chunk));
      return true;
    });

    const response = await inviteAs(admin, workspaceId, "nuovo@example.com");

    expect(response.status).toBe(201);
    expect(response.headers.get("cache-control")).toBe("no-store");
    const { data } = (await response.json()) as Issued;
    expect(data.emailSent).toBe(true);
    expect(data.inviteUrl).toContain("/invites/accept?token=");
    const token = tokenOf(data.inviteUrl);
    const rows = await prisma.workspaceInvite.findMany({ where: { email: "nuovo@example.com" } });
    expect(rows).toHaveLength(1);
    expect(sha256Hex(token)).toBe(rows[0].token_hash);
    const outbox = await prisma.emailOutbox.findMany({ where: { to_address: "nuovo@example.com" } });
    expect(outbox).toHaveLength(1);
    expect(outbox[0].text).toContain(data.inviteUrl);
    expect(logLines.some((line) => line.includes("workspace_invite_created"))).toBe(true);
    expect(logLines.filter((line) => line.includes(token))).toEqual([]);
  });

  // covers: AC-3201-2
  it("senza invio delle email la risposta è 201 con emailSent false e il link, l'invito resta pendente e nessuna email", async () => {
    const admin = await createUserWithSession({ displayName: "t3201-noemail" });
    const workspaceId = await createTeamWorkspace([{ session: admin, role: "ADMIN" }]);
    vi.stubEnv("EMAIL_TRANSPORT", "resend");
    vi.stubEnv("RESEND_API_KEY", "");
    vi.stubEnv("EMAIL_FROM", "");
    resetEnvForTests();

    const response = await inviteAs(admin, workspaceId, "altro@example.com");

    expect(response.status).toBe(201);
    const { data } = (await response.json()) as Issued;
    expect(data.emailSent).toBe(false);
    expect(data.inviteUrl).toContain("/invites/accept?token=");
    const rows = await prisma.workspaceInvite.findMany({ where: { email: "altro@example.com" } });
    expect(rows).toHaveLength(1);
    expect([rows[0].accepted_at, rows[0].revoked_at]).toEqual([null, null]);
    expect(rows[0].expires_at.getTime()).toBeGreaterThan(Date.now());
    expect(await prisma.emailOutbox.count({ where: { to_address: "altro@example.com" } })).toBe(0);
  });

  // covers: AC-3201-3
  it("il MEMBER riceve 403 e non nasce nessun invito", async () => {
    const owner = await createUserWithSession({ displayName: "t3201-m-owner" });
    const member = await createUserWithSession({ displayName: "t3201-member" });
    const workspaceId = await createTeamWorkspace([
      { session: owner, role: "OWNER" },
      { session: member, role: "MEMBER" },
    ]);

    const response = await inviteAs(member, workspaceId, "nuovo@example.com");

    expect(response.status).toBe(403);
    expect(await prisma.workspaceInvite.count()).toBe(0);
  });
});

describe("«Nuovo link» (T-3202)", () => {
  // covers: AC-3202-1
  it("un invito scaduto riceve un link nuovo valido 7 giorni: il vecchio token risponde 410, il nuovo entra", async () => {
    const admin = await createUserWithSession({ displayName: "t3202-admin" });
    const workspaceId = await createTeamWorkspace([{ session: admin, role: "ADMIN" }]);
    const invite = await insertInvite(workspaceId, "x@example.com", "vecchio-token-x", { expires_at: new Date(Date.now() - DAY_MS) });

    const before = Date.now();
    const response = await renewAs(admin, workspaceId, invite.id);

    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    const { data } = (await response.json()) as Issued;
    const token = tokenOf(data.inviteUrl);
    expect(token).not.toBe("vecchio-token-x");
    const renewed = await prisma.workspaceInvite.findUniqueOrThrow({ where: { id: invite.id } });
    expect(renewed.token_hash).not.toBe(invite.token_hash);
    expect(renewed.token_hash).toBe(sha256Hex(token));
    expect(renewed.expires_at.getTime()).toBeGreaterThanOrEqual(before + 7 * DAY_MS);
    expect(renewed.expires_at.getTime()).toBeLessThanOrEqual(Date.now() + 7 * DAY_MS);

    const invitee = await createUserWithSession({ displayName: "x", email: "x@example.com", emailVerified: true });
    expect(await codeOf(await acceptAs(invitee, "vecchio-token-x"))).toEqual([410, "INVITE_INVALID"]);
    expect((await acceptAs(invitee, token)).status).toBe(200);
  });

  // covers: AC-3202-2
  it("inviti accettati o revocati rispondono 410 e il MEMBER 403, senza toccare token e scadenze", async () => {
    const admin = await createUserWithSession({ displayName: "t3202-closed-admin" });
    const member = await createUserWithSession({ displayName: "t3202-closed-member" });
    const workspaceId = await createTeamWorkspace([
      { session: admin, role: "ADMIN" },
      { session: member, role: "MEMBER" },
    ]);
    const later = new Date(Date.now() + DAY_MS);
    const accepted = await insertInvite(workspaceId, "a@example.com", "token-a", { expires_at: later, accepted_at: new Date() });
    const revoked = await insertInvite(workspaceId, "r@example.com", "token-r", { expires_at: later, revoked_at: new Date() });
    const open = await insertInvite(workspaceId, "o@example.com", "token-o", { expires_at: later });
    const snapshot = () =>
      prisma.workspaceInvite.findMany({ orderBy: { email: "asc" }, select: { id: true, token_hash: true, expires_at: true } });
    const rowsBefore = await snapshot();

    const responses = [
      await renewAs(admin, workspaceId, accepted.id),
      await renewAs(admin, workspaceId, revoked.id),
      await renewAs(member, workspaceId, open.id),
    ];

    expect(await codeOf(responses[0])).toEqual([410, "INVITE_INVALID"]);
    expect(await codeOf(responses[1])).toEqual([410, "INVITE_INVALID"]);
    expect(responses[2].status).toBe(403);
    expect(await snapshot()).toEqual(rowsBefore);
  });

  it("creazione e rinnovo condividono il limite di 20 l'ora per workspace: oltre la soglia 429 RATE_LIMITED", async () => {
    const admin = await createUserWithSession({ displayName: "t3202-rate-admin" });
    const workspaceId = await createTeamWorkspace([{ session: admin, role: "ADMIN" }]);
    for (let index = 0; index < 19; index += 1) {
      expect((await inviteAs(admin, workspaceId, `persona-${index}@example.com`)).status).toBe(201);
    }
    const first = await prisma.workspaceInvite.findFirstOrThrow({ where: { email: "persona-0@example.com" } });

    const renewed = await renewAs(admin, workspaceId, first.id);
    const blocked = await inviteAs(admin, workspaceId, "persona-oltre@example.com");

    expect(renewed.status).toBe(200);
    expect(await codeOf(blocked)).toEqual([429, "RATE_LIMITED"]);
    expect(await prisma.workspaceInvite.count({ where: { email: "persona-oltre@example.com" } })).toBe(0);
  });
});
