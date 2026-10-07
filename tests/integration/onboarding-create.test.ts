// Gate di T-1001 (AC-1001-1…4): progetto e sezione dell'onboarding creati con l'avanzamento in una sola
// transazione e protetti da una chiave di idempotenza; il back del browser non porta a una seconda creazione.
import { randomUUID } from "node:crypto";
import { renderToStaticMarkup } from "react-dom/server";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { POST as createOnboardingProject } from "@/app/api/onboarding/project/route";
import { POST as createOnboardingSection } from "@/app/api/onboarding/section/route";
import { prisma } from "@/lib/prisma";
import { createUserWithSession, personalWorkspaceId } from "../helpers/auth";
import { resetDatabase } from "../helpers/db";
import { callRoute } from "../helpers/http";

const auth = vi.hoisted(() => ({ user: null as unknown }));

vi.mock("@/lib/auth/page-guard", () => ({ requirePageUser: async () => auth.user }));
vi.mock("next/navigation", async (importOriginal) => ({
  ...(await importOriginal<typeof import("next/navigation")>()),
  redirect: (url: string) => {
    throw new Error(`redirect ${url}`);
  },
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn(), replace: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
  usePathname: () => "/onboarding/project-create",
}));

// Errore forzato sulla scrittura del progress (AC-1001-2): trigger creato e rimosso dal test.
const CREATE_FAILING_FUNCTION = `CREATE OR REPLACE FUNCTION t1001_fail_progress() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'errore forzato del test T-1001';
END;
$$ LANGUAGE plpgsql`;
const CREATE_FAILING_TRIGGER =
  "CREATE TRIGGER t1001_fail_progress BEFORE INSERT OR UPDATE ON user_onboarding_progress FOR EACH ROW EXECUTE FUNCTION t1001_fail_progress()";
const DROP_FAILING_TRIGGER = "DROP TRIGGER IF EXISTS t1001_fail_progress ON user_onboarding_progress";
const DROP_FAILING_FUNCTION = "DROP FUNCTION IF EXISTS t1001_fail_progress()";

async function createOnboardingUser(username: string) {
  const session = await createUserWithSession({ displayName: username });
  await prisma.userOnboardingProgress.create({
    data: { user_id: session.user.id, status: "IN_PROGRESS", current_step: "PROJECT_CREATE", entry_mode: "RESUME" },
  });
  return session;
}

function postProject(cookie: string, body: unknown) {
  return callRoute(createOnboardingProject, { method: "POST", url: "/api/onboarding/project", cookie, body });
}

function postSection(cookie: string, body: unknown) {
  return callRoute(createOnboardingSection, { method: "POST", url: "/api/onboarding/section", cookie, body });
}

beforeAll(() => {
  vi.stubEnv("APP_AUTH_ENABLED", "true");
});

afterAll(() => {
  vi.unstubAllEnvs();
});

beforeEach(async () => {
  await resetDatabase();
});

describe("POST /api/onboarding/project", () => {
  // covers: AC-1001-1
  it("la stessa chiave inviata due volte restituisce 201 e poi 200 con lo stesso progetto", async () => {
    const { user, cookie } = await createOnboardingUser("t1001-project");
    const body = { name: "Blog", idempotencyKey: randomUUID() };

    const first = await postProject(cookie, body);
    const second = await postProject(cookie, body);
    const firstBody = await first.json();
    const secondBody = await second.json();

    expect(first.status).toBe(201);
    expect(second.status).toBe(200);
    expect(secondBody.data.projectId).toBe(firstBody.data.projectId);
    expect(await prisma.project.count({ where: { workspace_id: await personalWorkspaceId(user.id) } })).toBe(1);
    const progress = await prisma.userOnboardingProgress.findUniqueOrThrow({ where: { user_id: user.id } });
    expect(progress.current_step).toBe("PROJECT_TARGETING");
    expect(progress.active_project_id).toBe(firstBody.data.projectId);
  });

  // covers: AC-1001-2
  it("un errore sull'aggiornamento del progress annulla la creazione del progetto", async () => {
    const { user, cookie } = await createOnboardingUser("t1001-rollback");
    await prisma.$executeRawUnsafe(CREATE_FAILING_FUNCTION);
    await prisma.$executeRawUnsafe(CREATE_FAILING_TRIGGER);
    // Il 500 scrive una riga nel logger JSON su stdout (T-602): qui la si raccoglie invece di stamparla.
    const logged: string[] = [];
    const stdout = vi.spyOn(process.stdout, "write").mockImplementation((chunk: string | Uint8Array) => {
      logged.push(String(chunk));
      return true;
    });

    let response: Response;
    try {
      response = await postProject(cookie, { name: "Blog", idempotencyKey: randomUUID() });
    } finally {
      stdout.mockRestore();
      await prisma.$executeRawUnsafe(DROP_FAILING_TRIGGER);
      await prisma.$executeRawUnsafe(DROP_FAILING_FUNCTION);
    }
    const body = await response.json();

    expect(response.status).toBe(500);
    expect(body.error).toBe("Errore interno");
    expect(JSON.stringify(body)).not.toContain("errore forzato");
    expect(logged.filter((line) => line.includes("api_internal_error"))).toHaveLength(1);
    expect(await prisma.project.count({ where: { workspace_id: await personalWorkspaceId(user.id) } })).toBe(0);
  });

  it("una chiave che non è un UUID v4 riceve 400 con code", async () => {
    const { cookie } = await createOnboardingUser("t1001-key");

    const response = await postProject(cookie, { name: "Blog", idempotencyKey: "chiave-1" });
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.code).toBe("INVALID_IDEMPOTENCY_KEY");
  });
});

describe("POST /api/onboarding/section", () => {
  // covers: AC-1001-3
  it("nome già usato con una chiave nuova -> 409 SECTION_NAME_TAKEN; la chiave originale -> 200 con la stessa sezione", async () => {
    const { user, cookie } = await createOnboardingUser("t1001-section");
    const created = await (await postProject(cookie, { name: "Blog", idempotencyKey: randomUUID() })).json();
    const projectId: string = created.data.projectId;
    const k1 = randomUUID();

    const first = await postSection(cookie, { projectId, name: "Generale", idempotencyKey: k1 });
    const firstBody = await first.json();
    const withK2 = await postSection(cookie, { projectId, name: "Generale", idempotencyKey: randomUUID() });
    const withK2Body = await withK2.json();
    const withK1 = await postSection(cookie, { projectId, name: "Generale", idempotencyKey: k1 });
    const withK1Body = await withK1.json();

    expect(first.status).toBe(201);
    expect(withK2.status).toBe(409);
    expect(withK2Body.code).toBe("SECTION_NAME_TAKEN");
    expect(withK1.status).toBe(200);
    expect(withK1Body.data.subprojectId).toBe(firstBody.data.subprojectId);
    expect(await prisma.subproject.count({ where: { project_id: projectId } })).toBe(1);
    const project = await prisma.project.findUniqueOrThrow({ where: { id: projectId } });
    expect(project.default_subproject_id).toBe(firstBody.data.subprojectId);
    const progress = await prisma.userOnboardingProgress.findUniqueOrThrow({ where: { user_id: user.id } });
    expect(progress.current_step).toBe("SEEDS");
    expect(progress.active_subproject_id).toBe(firstBody.data.subprojectId);
  });

  it("il projectId di un altro utente riceve 404 senza creare sezioni", async () => {
    const owner = await createOnboardingUser("t1001-owner");
    const intruder = await createOnboardingUser("t1001-intruder");
    const created = await (await postProject(owner.cookie, { name: "Blog", idempotencyKey: randomUUID() })).json();

    const response = await postSection(intruder.cookie, {
      projectId: created.data.projectId,
      name: "Generale",
      idempotencyKey: randomUUID(),
    });

    expect(response.status).toBe(404);
    expect(await prisma.subproject.count()).toBe(0);
  });
});

describe("/onboarding/project-create con un progetto attivo", () => {
  // covers: AC-1001-4
  it("in RESTART al passo PROJECT_TARGETING mostra il progetto e 'Continua' invece del form", async () => {
    const { user } = await createUserWithSession({ displayName: "t1001-page" });
    const project = await prisma.project.create({ data: { name: "Blog", workspace_id: await personalWorkspaceId(user.id) } });
    await prisma.userOnboardingProgress.create({
      data: {
        user_id: user.id,
        status: "IN_PROGRESS",
        current_step: "PROJECT_TARGETING",
        entry_mode: "RESTART",
        active_project_id: project.id,
      },
    });
    auth.user = { id: user.id, displayName: user.display_name, role: user.role, isRootAdmin: false };
    const { default: ProjectCreatePage } = await import("@/app/onboarding/project-create/page");

    const html = renderToStaticMarkup(await ProjectCreatePage());

    expect(html).toContain("Blog");
    expect(html).toContain("Continua");
    expect(html).not.toContain('id="onboarding-project-name"');
  });
});
