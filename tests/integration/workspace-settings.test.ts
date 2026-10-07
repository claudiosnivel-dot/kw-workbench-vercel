// T-1504: API dei workspace dell'utente (elenco, workspace attivo, rinomina). Il percorso nel browser è coperto da
// tests/e2e/workspace-switch.spec.ts (AC-1504-1…4); qui gli esiti delle rotte e il cookie kwb_workspace.
import { beforeEach, describe, expect, it, vi } from "vitest";
import { GET as listWorkspaces } from "@/app/api/workspaces/route";
import { POST as setActiveWorkspace } from "@/app/api/workspaces/active/route";
import { PATCH as renameWorkspace } from "@/app/api/workspaces/[workspaceId]/route";
import { prisma } from "@/lib/prisma";
import { createUserWithSession } from "../helpers/auth";
import { resetDatabase } from "../helpers/db";
import { callRoute } from "../helpers/http";

beforeEach(async () => {
  vi.stubEnv("APP_AUTH_ENABLED", "true");
  await resetDatabase();
});

async function teamWithMember() {
  const owner = await createUserWithSession({ displayName: "t1504-owner" });
  const member = await createUserWithSession({ displayName: "t1504-member" });
  const team = await prisma.workspace.create({ data: { name: "Squadra", slug: "ws-t1504" } });
  await prisma.membership.createMany({
    data: [
      { workspace_id: team.id, user_id: owner.user.id, role: "OWNER" },
      { workspace_id: team.id, user_id: member.user.id, role: "MEMBER" },
    ],
  });
  return { owner, member, teamId: team.id };
}

describe("workspace attivo", () => {
  it("l'elenco segue il cookie riverificato; un workspace non accessibile riceve 404 e nessun cookie", async () => {
    const { member, teamId } = await teamWithMember();
    const outsider = await createUserWithSession({ displayName: "t1504-outsider" });

    const chosen = await callRoute(setActiveWorkspace, { method: "POST", url: "/api/workspaces/active", body: { workspaceId: teamId }, cookie: member.cookie });
    expect(chosen.status).toBe(204);
    const setCookie = chosen.headers.get("set-cookie") ?? "";
    expect(setCookie).toContain(`kwb_workspace=${teamId}`);
    expect(setCookie.toLowerCase()).toContain("httponly");
    expect(setCookie.toLowerCase()).toContain("samesite=lax");

    const listed = await callRoute(listWorkspaces, { url: "/api/workspaces", cookie: `${member.cookie}; kwb_workspace=${teamId}` });
    const { data } = (await listed.json()) as { data: { id: string; role: string; isPersonal: boolean; active: boolean }[] };
    expect(data).toEqual([
      expect.objectContaining({ id: member.workspaceId, role: "OWNER", isPersonal: true, active: false }),
      expect.objectContaining({ id: teamId, role: "MEMBER", isPersonal: false, active: true }),
    ]);

    const denied = await callRoute(setActiveWorkspace, {
      method: "POST",
      url: "/api/workspaces/active",
      body: { workspaceId: outsider.workspaceId },
      cookie: member.cookie,
    });
    expect([denied.status, ((await denied.json()) as { code: string }).code]).toEqual([404, "WORKSPACE_NOT_FOUND"]);
    expect(denied.headers.get("set-cookie")).toBeNull();

    const tampered = await callRoute(listWorkspaces, { url: "/api/workspaces", cookie: `${member.cookie}; kwb_workspace=${outsider.workspaceId}` });
    const active = ((await tampered.json()) as { data: { id: string; active: boolean }[] }).data.find((item) => item.active);
    expect(active?.id).toBe(member.workspaceId);
  });
});

describe("rinomina del workspace", () => {
  it("l'OWNER rinomina con 1-80 caratteri; il MEMBER riceve 403 e il nome non cambia", async () => {
    const { owner, member, teamId } = await teamWithMember();
    const rename = (cookie: string, name: unknown) =>
      callRoute(renameWorkspace, { method: "PATCH", url: `/api/workspaces/${teamId}`, body: { name }, cookie, params: { workspaceId: teamId } });

    const byMember = await rename(member.cookie, "Del membro");
    const tooLong = await rename(owner.cookie, "x".repeat(81));
    const renamed = await rename(owner.cookie, "  Team SEO  ");

    expect([byMember.status, ((await byMember.json()) as { code: string }).code]).toEqual([403, "FORBIDDEN"]);
    expect(tooLong.status).toBe(400);
    expect(renamed.status).toBe(200);
    expect((await prisma.workspace.findUniqueOrThrow({ where: { id: teamId } })).name).toBe("Team SEO");
  });
});
