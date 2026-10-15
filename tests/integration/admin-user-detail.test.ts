// Gate di T-3401 (AC-3401-1…3): scheda dell'utente per l'admin con le regole di visibilità dell'elenco; workspace (soli
// conteggi, mai i nomi dei progetti) e registro solo per il root admin.
import { UserRole, WorkspaceRole } from "@/lib/generated/prisma/enums";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { GET as getAdminUser } from "@/app/api/admin/users/[id]/route";
import { usagePeriodStart } from "@/lib/billing/usage";
import { prisma } from "@/lib/prisma";
import { createUserWithSession } from "../helpers/auth";
import { resetDatabase } from "../helpers/db";
import { callRoute } from "../helpers/http";

type DetailBody = {
  code?: string;
  data?: {
    id: string;
    email: string;
    workspaces?: Array<{ id: string; role: string; personal: boolean; projectCount: number; keywordsThisMonth: number }>;
    audit?: unknown[];
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

function getUser(id: string, cookie: string) {
  return callRoute(getAdminUser, { url: `/api/admin/users/${id}`, cookie, params: { id } });
}

describe("scheda dell'utente per il root admin", () => {
  // covers: AC-3401-1
  it("restituisce i workspace con i conteggi, no-store e senza nomi dei progetti né hash della password", async () => {
    const root = await createUserWithSession({ displayName: "t3401-root", role: UserRole.ADMIN, isRootAdmin: true });
    const target = await createUserWithSession({ displayName: "t3401-utente" });
    const other = await createUserWithSession({ displayName: "t3401-altro" });
    // W1 è il workspace personale dell'utente (OWNER), W2 quello di un altro utente in cui è MEMBER.
    const w1 = target.workspaceId;
    await prisma.project.createMany({
      data: [
        { workspace_id: w1, name: "Progetto-Segreto-XYZ" },
        { workspace_id: w1, name: "Secondo progetto" },
      ],
    });
    await prisma.usageCounter.create({
      data: { workspace_id: w1, metric: "keywords_month", period_start: usagePeriodStart("keywords_month", new Date()), count: 1240 },
    });
    await prisma.membership.create({ data: { workspace_id: other.workspaceId, user_id: target.user.id, role: WorkspaceRole.MEMBER } });

    const response = await getUser(target.user.id, root.cookie);
    const text = await response.text();
    const body = JSON.parse(text) as DetailBody;

    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(body.data?.workspaces).toHaveLength(2);
    const owned = body.data?.workspaces?.find((workspace) => workspace.id === w1);
    expect(owned).toMatchObject({ role: "OWNER", personal: true, projectCount: 2, keywordsThisMonth: 1240 });
    expect(body.data?.workspaces?.find((workspace) => workspace.id === other.workspaceId)).toMatchObject({
      role: "MEMBER",
      projectCount: 0,
      keywordsThisMonth: 0,
    });
    expect(text).not.toContain("Progetto-Segreto-XYZ");
    expect(text).not.toContain("password_hash");
    expect(text).not.toContain(target.user.password_hash);
  });
});

describe("visibilità della scheda", () => {
  // covers: AC-3401-2
  it("l'admin non root vede il sottoscrittore senza workspace e registro e riceve 404 per un admin", async () => {
    const admin = await createUserWithSession({ displayName: "t3401-admin", role: UserRole.ADMIN });
    const subscriber = await createUserWithSession({ displayName: "t3401-sottoscrittore" });
    const otherAdmin = await createUserWithSession({ displayName: "t3401-admin-due", role: UserRole.ADMIN });

    const first = await getUser(subscriber.user.id, admin.cookie);
    const second = await getUser(otherAdmin.user.id, admin.cookie);

    expect(first.status).toBe(200);
    const body = (await first.json()) as DetailBody;
    expect(body.data?.id).toBe(subscriber.user.id);
    expect(body.data).not.toHaveProperty("workspaces");
    expect(body.data).not.toHaveProperty("audit");
    expect(second.status).toBe(404);
  });

  // covers: AC-3401-3
  it("un sottoscrittore riceve 403", async () => {
    const subscriber = await createUserWithSession({ displayName: "t3401-curioso" });
    const target = await createUserWithSession({ displayName: "t3401-bersaglio" });

    const response = await getUser(target.user.id, subscriber.cookie);

    expect(response.status).toBe(403);
  });
});
