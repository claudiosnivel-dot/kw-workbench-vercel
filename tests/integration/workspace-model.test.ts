// Gate di T-1501 (AC-1501-1…4): workspace e membership, migrazione dei progetti dal proprietario al workspace personale,
// workspace personale creato con l'utente nella stessa transazione e filtro di accesso per membership.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { POST as register } from "@/app/api/auth/register/route";
import { POST as createProject } from "@/app/api/projects/route";
import { DELETE as deleteProject, PATCH as patchProject } from "@/app/api/projects/[id]/route";
import { registerUser } from "@/lib/auth/credentials";
import { resetEnvForTests } from "@/lib/env";
import { Prisma } from "@/lib/generated/prisma/client";
import { LEGAL_TERMS_VERSION } from "@/lib/legal/version";
import { prisma } from "@/lib/prisma";
import { createUserWithSession } from "../helpers/auth";
import { resetDatabase } from "../helpers/db";
import { callRoute } from "../helpers/http";
import { flushAfter } from "../helpers/next-after";
import { createTemporaryDatabase, type TemporaryDatabase } from "../helpers/migrations";
import { setCommercialLaunchForTests } from "../helpers/launch";

const WORKSPACES_MIGRATION = "0032_workspaces";

// La creazione del workspace personale si può far fallire dentro la transazione della registrazione (AC-1501-3).
const personalWorkspace = vi.hoisted(() => ({ fail: false }));
vi.mock("@/lib/workspaces/personal", async (importOriginal) => {
  const original = await importOriginal<typeof import("@/lib/workspaces/personal")>();
  return {
    createPersonalWorkspace: async (...args: Parameters<typeof original.createPersonalWorkspace>) => {
      if (personalWorkspace.fail) {
        throw new Error("creazione del workspace personale fallita (test)");
      }
      return original.createPersonalWorkspace(...args);
    },
  };
});

async function tableCounts() {
  const [users, workspaces, memberships] = await Promise.all([
    prisma.user.count(),
    prisma.workspace.count(),
    prisma.membership.count(),
  ]);
  return { users, workspaces, memberships };
}

describe("migrazione workspace", () => {
  let database: TemporaryDatabase;

  beforeEach(async () => {
    database = await createTemporaryDatabase();
    await database.migrateBefore(WORKSPACES_MIGRATION);
  });

  afterEach(async () => {
    await database.drop();
  });

  /** Utente e progetti allo schema precedente (owner_user_id), con gli id scelti dal test. */
  async function insertLegacyData(users: { id: string; rootAdmin?: boolean }[], projects: { id: string; owner: string | null }[]) {
    for (const user of users) {
      await database.client.query(
        `INSERT INTO "users" ("id", "display_name", "password_hash", "is_root_admin", "updated_at") VALUES ($1, $2, 'hash-fittizio', $3, now())`,
        [user.id, `nome ${user.id}`, user.rootAdmin ?? false]
      );
    }
    for (const project of projects) {
      await database.client.query(
        `INSERT INTO "projects" ("id", "owner_user_id", "name", "updated_at") VALUES ($1, $2, $3, now())`,
        [project.id, project.owner, `Progetto ${project.id}`]
      );
    }
  }

  // covers: AC-1501-1
  it("sposta i progetti nel workspace personale del proprietario, gli orfani in quello del root admin, e toglie owner_user_id", async () => {
    await insertLegacyData(
      [{ id: "user-a" }, { id: "user-b" }, { id: "user-root", rootAdmin: true }],
      [
        { id: "project-a1", owner: "user-a" },
        { id: "project-a2", owner: "user-a" },
        { id: "project-b1", owner: "user-b" },
        { id: "project-orphan", owner: null },
      ]
    );

    await database.apply(WORKSPACES_MIGRATION);

    const workspaces = await database.client.query<{ id: string; personal_for_user_id: string | null; name: string }>(
      `SELECT "id", "personal_for_user_id", "name" FROM "workspaces"`
    );
    expect(workspaces.rows).toHaveLength(3);
    expect(workspaces.rows.map((row) => row.personal_for_user_id).sort()).toEqual(["user-a", "user-b", "user-root"]);
    const personalOf = new Map(workspaces.rows.map((row) => [row.personal_for_user_id, row.id]));
    expect(workspaces.rows.find((row) => row.personal_for_user_id === "user-a")?.name).toBe("nome user-a");

    const memberships = await database.client.query<{ workspace_id: string; user_id: string; role: string }>(
      `SELECT "workspace_id", "user_id", "role"::text AS "role" FROM "memberships"`
    );
    expect(memberships.rows).toHaveLength(3);
    for (const membership of memberships.rows) {
      expect(membership.role).toBe("OWNER");
      expect(membership.workspace_id).toBe(personalOf.get(membership.user_id));
    }

    const projects = await database.client.query<{ id: string; workspace_id: string; created_by_user_id: string | null }>(
      `SELECT "id", "workspace_id", "created_by_user_id" FROM "projects" ORDER BY "id"`
    );
    const byId = new Map(projects.rows.map((row) => [row.id, row]));
    for (const id of ["project-a1", "project-a2"]) {
      expect(byId.get(id)).toMatchObject({ workspace_id: personalOf.get("user-a"), created_by_user_id: "user-a" });
    }
    expect(byId.get("project-b1")).toMatchObject({ workspace_id: personalOf.get("user-b"), created_by_user_id: "user-b" });
    expect(byId.get("project-orphan")?.workspace_id).toBe(personalOf.get("user-root"));

    const ownerColumn = await database.client.query(
      `SELECT 1 FROM information_schema.columns WHERE table_name = 'projects' AND column_name = 'owner_user_id'`
    );
    expect(ownerColumn.rowCount).toBe(0);
    expect(database.notices).toContain("workspaces: progetti orfani riassegnati al root admin: 1, eliminati: 0");
  });

  it("con users vuota elimina i progetti orfani e lo dichiara con RAISE NOTICE", async () => {
    await insertLegacyData([], [{ id: "project-orphan", owner: null }]);

    await database.apply(WORKSPACES_MIGRATION);

    const projects = await database.client.query(`SELECT 1 FROM "projects"`);
    expect(projects.rowCount).toBe(0);
    expect(database.notices).toContain("workspaces: progetti orfani riassegnati al root admin: 0, eliminati: 1");
  });
});

describe("workspace personale alla registrazione", () => {
  beforeEach(async () => {
    vi.stubEnv("APP_AUTH_ENABLED", "true");
    vi.stubEnv("APP_PUBLIC_SIGNUP_ENABLED", "true");
    vi.stubEnv("APP_ADMIN_EMAIL", "root@example.test");
    resetEnvForTests();
    personalWorkspace.fail = false;
    await resetDatabase();
    // impacted-by: T-1606 (registrazione pubblica aperta solo con il lancio commerciale attivo, D-32)
    await setCommercialLaunchForTests("live");
  });

  afterEach(() => {
    personalWorkspace.fail = false;
    vi.unstubAllEnvs();
    resetEnvForTests();
  });

  // covers: AC-1501-2
  it("la registrazione crea un workspace personale e una membership OWNER", async () => {
    const password = "password-1501-non-reale";
    const response = await callRoute(register, {
      method: "POST",
      url: "/api/auth/register",
      body: { email: "nuovo@example.com", password, confirmPassword: password, acceptTerms: true, termsVersion: LEGAL_TERMS_VERSION },
    });
    await flushAfter();

    expect(response.status).toBe(202);
    const user = await prisma.user.findUniqueOrThrow({ where: { email: "nuovo@example.com" } });
    const workspaces = await prisma.workspace.findMany({ where: { personal_for_user_id: user.id } });
    expect(workspaces).toHaveLength(1);
    const memberships = await prisma.membership.findMany({ where: { user_id: user.id } });
    expect(memberships).toEqual([expect.objectContaining({ workspace_id: workspaces[0].id, role: "OWNER" })]);
  });

  // covers: AC-1501-3
  it("se il workspace personale fallisce dentro la transazione non resta nessuna riga", async () => {
    await createUserWithSession({ displayName: "t1501-esistente" });
    const before = await tableCounts();

    personalWorkspace.fail = true;
    await expect(registerUser({ email: "fallito@example.com", password: "password-1501-non-reale" })).rejects.toThrow(
      "creazione del workspace personale fallita (test)"
    );

    expect(await tableCounts()).toEqual(before);
    expect(await prisma.user.count({ where: { email: "fallito@example.com" } })).toBe(0);
  });
});

describe("accesso ai progetti per membership", () => {
  beforeEach(async () => {
    vi.stubEnv("APP_AUTH_ENABLED", "true");
    personalWorkspace.fail = false;
    await resetDatabase();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  // covers: AC-1501-4
  it("chi non è membro riceve 404 e il progetto non cambia; il nuovo progetto nasce nel workspace personale", async () => {
    const a = await createUserWithSession({ displayName: "t1501-a" });
    const b = await createUserWithSession({ displayName: "t1501-b" });
    const project = await prisma.project.create({
      data: { name: "Progetto di A", workspace_id: a.workspaceId, created_by_user_id: a.user.id },
    });
    const params = { id: project.id };
    const url = `/api/projects/${project.id}`;

    const patched = await callRoute(patchProject, { method: "PATCH", url, body: { name: "di B" }, cookie: b.cookie, params });
    const deleted = await callRoute(deleteProject, { method: "DELETE", url, cookie: b.cookie, params });

    expect(patched.status).toBe(404);
    expect(deleted.status).toBe(404);
    const after = await prisma.project.findUniqueOrThrow({ where: { id: project.id } });
    expect(after.updated_at).toEqual(project.updated_at);
    expect(after.name).toBe("Progetto di A");

    const created = await callRoute(createProject, { method: "POST", url: "/api/projects", body: { name: "Nuovo di A" }, cookie: a.cookie });
    expect(created.status).toBe(201);
    const { data } = (await created.json()) as { data: { project: { id: string } } };
    const saved = await prisma.project.findUniqueOrThrow({ where: { id: data.project.id } });
    expect(saved.workspace_id).toBe(a.workspaceId);
    expect(saved.created_by_user_id).toBe(a.user.id);

    const duplicate = prisma.membership.create({ data: { workspace_id: a.workspaceId, user_id: a.user.id, role: "MEMBER" } });
    await expect(duplicate).rejects.toSatisfy(
      (error: unknown) => error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002"
    );
  });
});
