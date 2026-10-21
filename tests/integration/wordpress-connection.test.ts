// Gate di T-4601 (AC-4601-1, AC-4601-2, AC-4601-3): il collegamento a WordPress salva la password per le applicazioni
// cifrata e senza spazi e non la restituisce mai; l'indirizzo è solo https verso un nome host pubblico; la prova
// risponde con l'utente WordPress o con l'esito, e non chiama mai un sito che si risolve in un indirizzo privato.
import { randomBytes, randomUUID } from "node:crypto";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { PATCH as patchProjectRoute } from "@/app/api/projects/[id]/route";
import { prisma } from "@/lib/prisma";
import { decryptSecret } from "@/lib/security/encryption";
import { createUserWithSession } from "../helpers/auth";
import { resetDatabase } from "../helpers/db";
import { callRoute } from "../helpers/http";
import {
  APP_PASSWORD,
  captureLogs,
  deleteConnection,
  expectedAuthorization,
  putConnection,
  saveConnection,
  SITE_URL,
  stubDns,
  testConnection,
} from "../helpers/wordpress";

const fetchMock = vi.fn<typeof fetch>();

beforeAll(() => {
  vi.stubEnv("APP_AUTH_ENABLED", "true");
  vi.stubEnv("APP_ENCRYPTION_KEY", randomBytes(32).toString("hex"));
});

beforeEach(async () => {
  await resetDatabase();
  fetchMock.mockReset();
  vi.stubGlobal("fetch", fetchMock);
  stubDns({ "blog.esempio.it": "93.184.216.34", "interno.esempio.it": "10.0.0.5" });
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

/** Proprietario con un progetto nuovo nel suo workspace. */
async function ownerProject(label: string) {
  const owner = await createUserWithSession({ displayName: `${label}-${randomUUID().slice(0, 8)}` });
  const project = await prisma.project.create({ data: { name: "Blog", workspace_id: owner.workspaceId, language_code: "it" } });
  return { owner, projectId: project.id };
}

const connectionRow = (projectId: string) =>
  prisma.project.findUniqueOrThrow({
    where: { id: projectId },
    select: { wp_site_url: true, wp_username: true, wp_password_encrypted: true, updated_at: true },
  });

const meResponse = (capabilities: Record<string, boolean>) => Response.json({ id: 3, name: "Redazione Blog", capabilities });

describe("collegamento a WordPress", () => {
  // covers: AC-4601-1
  it("la PUT dell'OWNER risponde 200 senza la password e salva la password cifrata senza spazi", async () => {
    const { owner, projectId } = await ownerProject("t4601");
    const plain = APP_PASSWORD.replaceAll(" ", "");

    const response = await putConnection(owner.cookie, projectId, { siteUrl: SITE_URL, username: "redazione", appPassword: APP_PASSWORD });
    const text = await response.text();
    const row = await connectionRow(projectId);

    expect(response.status).toBe(200);
    expect(JSON.parse(text)).toEqual({ data: { siteUrl: SITE_URL, username: "redazione", configured: true } });
    expect(text).not.toContain(plain);
    expect(text).not.toContain(APP_PASSWORD);
    expect(row.wp_site_url).toBe(SITE_URL);
    expect(row.wp_username).toBe("redazione");
    expect(row.wp_password_encrypted).not.toBeNull();
    expect(row.wp_password_encrypted).not.toBe(plain);
    expect(row.wp_password_encrypted).not.toBe(APP_PASSWORD);
    expect(decryptSecret(row.wp_password_encrypted ?? "")).toBe(plain);
  });

  it("la riga intera del progetto, come nella risposta della PATCH, non contiene la password cifrata", async () => {
    const { owner, projectId } = await ownerProject("t4601-patch");
    await saveConnection(projectId);

    const response = await callRoute(patchProjectRoute, {
      method: "PATCH",
      url: `/api/projects/${projectId}`,
      cookie: owner.cookie,
      params: { id: projectId },
      body: { name: "Blog aggiornato" },
    });
    const body = (await response.json()) as { data: Record<string, unknown> };

    expect(response.status).toBe(200);
    expect(body.data.name).toBe("Blog aggiornato");
    expect(body.data.wp_site_url).toBe(SITE_URL);
    expect(body.data).not.toHaveProperty("wp_password_encrypted");
  });

  // covers: AC-4601-2
  it("un indirizzo http, un indirizzo IP o localhost sono 400 VALIDATION_ERROR e il progetto non cambia", async () => {
    const { owner, projectId } = await ownerProject("t4601-invalid");
    const before = await connectionRow(projectId);

    for (const siteUrl of ["http://blog.esempio.it", "https://127.0.0.1", "https://localhost"]) {
      const response = await putConnection(owner.cookie, projectId, { siteUrl, username: "redazione", appPassword: APP_PASSWORD });
      expect(response.status).toBe(400);
      expect(((await response.json()) as { code: string }).code).toBe("VALIDATION_ERROR");
    }

    expect(await connectionRow(projectId)).toEqual(before);
  });

  it("una password che non ha 24 lettere o cifre e un campo in più sono 400; un utente di un altro workspace riceve 404", async () => {
    const { owner, projectId } = await ownerProject("t4601-password");
    const stranger = await createUserWithSession({ displayName: `t4601-other-${randomUUID().slice(0, 8)}` });

    const short = await putConnection(owner.cookie, projectId, { siteUrl: SITE_URL, username: "redazione", appPassword: "aBcD 1234" });
    const symbols = await putConnection(owner.cookie, projectId, { siteUrl: SITE_URL, username: "redazione", appPassword: "aBcD 1234 eFgH 5678 iJkL 90-!" });
    const extra = await putConnection(owner.cookie, projectId, { siteUrl: SITE_URL, username: "redazione", appPassword: APP_PASSWORD, workspaceId: "x" });
    const other = await putConnection(stranger.cookie, projectId, { siteUrl: SITE_URL, username: "redazione", appPassword: APP_PASSWORD });

    expect([short.status, symbols.status, extra.status]).toEqual([400, 400, 400]);
    expect(other.status).toBe(404);
    expect((await connectionRow(projectId)).wp_site_url).toBeNull();
  });

  // covers: AC-4601-3
  it("la prova risponde con il nome dell'utente, poi WP_AUTH_FAILED, poi WP_UNREACHABLE senza chiamare un sito con un indirizzo privato", async () => {
    const { owner, projectId } = await ownerProject("t4601-test");
    await saveConnection(projectId);
    fetchMock.mockResolvedValueOnce(meResponse({ edit_posts: true, publish_posts: true }));
    fetchMock.mockResolvedValueOnce(Response.json({ code: "incorrect_password" }, { status: 401 }));

    const ok = await testConnection(owner.cookie, projectId);
    const denied = await testConnection(owner.cookie, projectId);
    const [url, init] = fetchMock.mock.calls[0];
    await saveConnection(projectId, "https://interno.esempio.it");
    const internal = await testConnection(owner.cookie, projectId);

    expect(ok.status).toBe(200);
    expect(await ok.json()).toEqual({ data: { name: "Redazione Blog", canEditPosts: true } });
    expect(String(url)).toBe(`${SITE_URL}/wp-json/wp/v2/users/me?context=edit`);
    expect(new Headers(init?.headers).get("authorization")).toBe(expectedAuthorization());
    expect(init?.redirect).toBe("manual");
    expect(init?.signal).toBeInstanceOf(AbortSignal);
    expect(denied.status).toBe(502);
    expect(((await denied.json()) as { code: string }).code).toBe("WP_AUTH_FAILED");
    expect(internal.status).toBe(502);
    expect(((await internal.json()) as { code: string }).code).toBe("WP_UNREACHABLE");
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("senza edit_posts la prova lo dice; 404 è WP_NOT_FOUND, un redirect verso un altro sito WP_UNREACHABLE, senza collegamento 409", async () => {
    const { owner, projectId } = await ownerProject("t4601-outcomes");
    const missing = await testConnection(owner.cookie, projectId);
    await saveConnection(projectId);
    fetchMock.mockResolvedValueOnce(meResponse({ read: true }));
    fetchMock.mockResolvedValueOnce(new Response("<html></html>", { status: 404 }));
    fetchMock.mockResolvedValueOnce(new Response(null, { status: 302, headers: { Location: "https://altro.esempio.it/wp-json/" } }));

    const reader = await testConnection(owner.cookie, projectId);
    const notFound = await testConnection(owner.cookie, projectId);
    const { result: redirected, logs } = await captureLogs(() => testConnection(owner.cookie, projectId));

    expect(missing.status).toBe(409);
    expect(((await missing.json()) as { code: string }).code).toBe("WP_NOT_CONFIGURED");
    expect(await reader.json()).toEqual({ data: { name: "Redazione Blog", canEditPosts: false } });
    expect(((await notFound.json()) as { code: string }).code).toBe("WP_NOT_FOUND");
    expect(((await redirected.json()) as { code: string }).code).toBe("WP_UNREACHABLE");
    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(logs).toContain('"msg":"wordpress_test"');
    expect(logs).toContain('"status":302');
    expect(logs).not.toContain(APP_PASSWORD.replaceAll(" ", ""));
    expect(logs).not.toContain("blog.esempio.it");
  });

  it("DELETE scollega: indirizzo, utente e password tornano vuoti", async () => {
    const { owner, projectId } = await ownerProject("t4601-delete");
    await saveConnection(projectId);

    const response = await deleteConnection(owner.cookie, projectId);
    const row = await connectionRow(projectId);

    expect(response.status).toBe(200);
    expect([row.wp_site_url, row.wp_username, row.wp_password_encrypted]).toEqual([null, null, null]);
  });
});
