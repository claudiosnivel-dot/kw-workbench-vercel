// Gate di T-3403 (AC-3403-1…3): elenco dei workspace della piattaforma per il solo root admin, con proprietario, membri,
// numero di progetti e piano; nessun dato dei progetti.
import { UserRole, WorkspaceRole } from "@/lib/generated/prisma/enums";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { GET as listWorkspaces } from "@/app/api/admin/workspaces/route";
import { prisma } from "@/lib/prisma";
import { createUserWithSession } from "../helpers/auth";
import { resetDatabase } from "../helpers/db";
import { callRoute } from "../helpers/http";

type ListBody = {
  data: {
    workspaces: Array<{ id: string; membersCount: number; projectCount: number; owner: { id: string } | null; plan: string }>;
    total: number;
  };
};

beforeAll(() => {
  vi.stubEnv("APP_AUTH_ENABLED", "true");
});

afterAll(() => {
  vi.unstubAllEnvs();
});

beforeEach(async () => {
  await resetDatabase();
});

/** W1 «Agenzia Rossi» con OWNER, un ADMIN e un MEMBER e 7 progetti; W2 è il workspace personale di un altro utente. */
async function seedWorkspaces() {
  const root = await createUserWithSession({ displayName: "t3403-root", role: UserRole.ADMIN, isRootAdmin: true });
  const owner = await createUserWithSession({ displayName: "t3403-titolare" });
  const colleague = await createUserWithSession({ displayName: "t3403-collega" });
  const member = await createUserWithSession({ displayName: "t3403-membro" });
  const stranger = await createUserWithSession({ displayName: "t3403-estraneo" });
  const w1 = await prisma.workspace.create({
    data: {
      name: "Agenzia Rossi",
      slug: "agenzia-rossi-t3403",
      memberships: {
        create: [
          { user_id: owner.user.id, role: WorkspaceRole.OWNER },
          { user_id: colleague.user.id, role: WorkspaceRole.ADMIN },
          { user_id: member.user.id, role: WorkspaceRole.MEMBER },
        ],
      },
    },
  });
  await prisma.project.createMany({
    data: Array.from({ length: 7 }, (_, index) => ({ workspace_id: w1.id, name: index === 0 ? "Progetto-Segreto-XYZ" : `Progetto ${index}` })),
  });
  return { root, owner, w1: w1.id, w2: stranger.workspaceId };
}

function list(cookie: string | undefined, query = "") {
  return callRoute(listWorkspaces, { url: `/api/admin/workspaces${query}`, cookie });
}

describe("elenco dei workspace per il root admin", () => {
  // covers: AC-3403-1
  it("restituisce membri, progetti, proprietario e piano, no-store e senza nomi dei progetti", async () => {
    const { root, owner, w1 } = await seedWorkspaces();

    const response = await list(root.cookie);
    const text = await response.text();
    const body = JSON.parse(text) as ListBody;

    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(body.data.workspaces.find((workspace) => workspace.id === w1)).toMatchObject({
      membersCount: 3,
      projectCount: 7,
      owner: { id: owner.user.id },
      plan: "free",
    });
    expect(text).not.toContain("Progetto-Segreto-XYZ");
  });

  // covers: AC-3403-2
  it("la ricerca senza distinzione di maiuscole trova W1 e non W2", async () => {
    const { root, w1, w2 } = await seedWorkspaces();

    const response = await list(root.cookie, "?searchText=ROSSI");
    const ids = ((await response.json()) as ListBody).data.workspaces.map((workspace) => workspace.id);

    expect(response.status).toBe(200);
    expect(ids).toContain(w1);
    expect(ids).not.toContain(w2);
  });
});

describe("accesso all'elenco dei workspace", () => {
  // covers: AC-3403-3
  it("admin non root e sottoscrittore ricevono 403, senza sessione 401", async () => {
    const admin = await createUserWithSession({ displayName: "t3403-admin", role: UserRole.ADMIN });
    const subscriber = await createUserWithSession({ displayName: "t3403-sottoscrittore" });

    const statuses = [(await list(admin.cookie)).status, (await list(subscriber.cookie)).status, (await list(undefined)).status];

    expect(statuses).toEqual([403, 403, 401]);
  });
});
