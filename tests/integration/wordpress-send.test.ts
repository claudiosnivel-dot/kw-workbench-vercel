// Gate di T-4602 (AC-4602-1, AC-4602-2, AC-4602-3): l'articolo va a WordPress come bozza con titolo, slug, estratto e
// Basic auth, e l'articolo ne salva id e link; un secondo invio aggiorna la stessa bozza; senza collegamento 409
// WP_NOT_CONFIGURED, con un 401 di WordPress 502 WP_AUTH_FAILED, e il log non contiene la password né il testo.
import { randomBytes, randomUUID } from "node:crypto";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { prisma } from "@/lib/prisma";
import { memberWithPlan, pageRow } from "../helpers/ai-titles";
import { insertReadyArticle } from "../helpers/articles";
import { createUserWithSession } from "../helpers/auth";
import { resetDatabase } from "../helpers/db";
import { APP_PASSWORD, captureLogs, expectedAuthorization, putConnection, saveConnection, SITE_URL, sendToWordPress, stubDns } from "../helpers/wordpress";

const fetchMock = vi.fn<typeof fetch>();
const BODY = "Misura il piede la sera, quando è più gonfio.";
const POSTS = `${SITE_URL}/wp-json/wp/v2/posts`;

beforeAll(() => {
  vi.stubEnv("APP_AUTH_ENABLED", "true");
  vi.stubEnv("APP_ENCRYPTION_KEY", randomBytes(32).toString("hex"));
});

beforeEach(async () => {
  await resetDatabase();
  fetchMock.mockReset();
  vi.stubGlobal("fetch", fetchMock);
  stubDns({ "blog.esempio.it": "93.184.216.34", "nuovo.esempio.it": "93.184.216.35" });
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

/** Spoke con l'articolo pronto, nel progetto collegato a WordPress salvo indicazione contraria. */
async function readySpoke(label: string, options: { connected?: boolean } = { connected: true }) {
  const setup = await memberWithPlan(`${label}-${randomUUID().slice(0, 8)}`);
  const articleId = await insertReadyArticle(setup.spoke, {
    slug: "scarpe-running-donna",
    sections: [
      { kind: "INTRO", body: "Le scarpe giuste cambiano la corsa." },
      { kind: "H2", heading: "Come scegliere la taglia", body: BODY },
    ],
  });
  if (options.connected) await saveConnection(setup.plan.projectId);
  return { ...setup, articleId };
}

const articleRow = (id: string) => prisma.article.findUniqueOrThrow({ where: { id }, select: { wp_post_id: true, wp_post_url: true } });
const sentPost = (init: RequestInit | undefined) => JSON.parse(String(init?.body)) as Record<string, unknown>;
const callsOf = () => fetchMock.mock.calls.map(([input, init]) => `${init?.method ?? "GET"} ${String(input)}`);
const created = (id: number) => Response.json({ id, link: `${SITE_URL}/?p=${id}`, status: "draft" }, { status: 201 });

describe("invio dell'articolo a WordPress", () => {
  // covers: AC-4602-1
  it("la prima volta crea la bozza con titolo, slug, estratto e Basic auth e salva id e link", async () => {
    const { member, spoke, articleId } = await readySpoke("t4602");
    fetchMock.mockResolvedValueOnce(created(57));

    const response = await sendToWordPress(member.cookie, spoke);
    const [url, init] = fetchMock.mock.calls[0];
    const post = sentPost(init);

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ data: { postId: 57, postUrl: `${SITE_URL}/?p=57` } });
    expect(callsOf()).toEqual([`POST ${POSTS}`]);
    expect(String(url)).toBe(POSTS);
    expect(new Headers(init?.headers).get("authorization")).toBe(expectedAuthorization());
    expect(post).toMatchObject({ status: "draft", title: (await pageRow(spoke.pageId)).h1, slug: "scarpe-running-donna", excerpt: "Descrizione" });
    expect(String(post.content)).toContain("<h2>Come scegliere la taglia</h2>");
    expect(String(post.content)).not.toContain("<h1>");
    expect(await articleRow(articleId)).toEqual({ wp_post_id: 57, wp_post_url: `${SITE_URL}/?p=57` });
  });

  // covers: AC-4602-2
  it("con wp_post_id 57 il secondo invio va a /posts/57 e non crea un'altra bozza", async () => {
    const { member, spoke, articleId } = await readySpoke("t4602-update");
    await prisma.article.update({ where: { id: articleId }, data: { wp_post_id: 57, wp_post_url: `${SITE_URL}/?p=57` } });
    fetchMock.mockResolvedValueOnce(Response.json({ id: 57, status: "draft" }));
    fetchMock.mockResolvedValueOnce(Response.json({ id: 57, link: `${SITE_URL}/?p=57`, status: "draft" }));

    const response = await sendToWordPress(member.cookie, spoke);

    expect(response.status).toBe(200);
    expect(callsOf()).toEqual([`GET ${POSTS}/57?context=edit`, `POST ${POSTS}/57`]);
    expect(sentPost(fetchMock.mock.calls[1][1])).toMatchObject({ slug: "scarpe-running-donna", excerpt: "Descrizione" });
    expect(await articleRow(articleId)).toEqual({ wp_post_id: 57, wp_post_url: `${SITE_URL}/?p=57` });
  });

  // covers: AC-4602-3
  it("senza collegamento 409 WP_NOT_CONFIGURED, con un 401 di WordPress 502 WP_AUTH_FAILED; il log non ha password né testo", async () => {
    const unconnected = await readySpoke("t4602-none", { connected: false });
    const connected = await readySpoke("t4602-401");
    fetchMock.mockResolvedValueOnce(Response.json({ code: "rest_cannot_create" }, { status: 401 }));

    const { result: missing, logs: missingLogs } = await captureLogs(() => sendToWordPress(unconnected.member.cookie, unconnected.spoke));
    const { result: denied, logs } = await captureLogs(() => sendToWordPress(connected.member.cookie, connected.spoke));

    expect(missing.status).toBe(409);
    expect(((await missing.json()) as { code: string }).code).toBe("WP_NOT_CONFIGURED");
    expect(denied.status).toBe(502);
    expect(((await denied.json()) as { code: string }).code).toBe("WP_AUTH_FAILED");
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(missingLogs).toContain('"outcome":"WP_NOT_CONFIGURED"');
    expect(logs).toContain('"msg":"wordpress_send"');
    expect(logs).toContain('"status":401');
    for (const text of [missingLogs, logs]) {
      expect(text).not.toContain(APP_PASSWORD.replaceAll(" ", ""));
      expect(text).not.toContain(BODY);
      expect(text).not.toContain("Come scegliere la taglia");
    }
    expect((await articleRow(connected.articleId)).wp_post_id).toBeNull();
  });

  it("una bozza già pubblicata o sparita da WordPress non si tocca: se ne crea una nuova", async () => {
    const { member, spoke, articleId } = await readySpoke("t4602-published");
    await prisma.article.update({ where: { id: articleId }, data: { wp_post_id: 57 } });
    fetchMock.mockResolvedValueOnce(Response.json({ id: 57, status: "publish" }));
    fetchMock.mockResolvedValueOnce(created(58));
    fetchMock.mockResolvedValueOnce(new Response(JSON.stringify({ code: "rest_post_invalid_id" }), { status: 404 }));
    fetchMock.mockResolvedValueOnce(created(59));

    const published = await sendToWordPress(member.cookie, spoke);
    const afterPublished = await articleRow(articleId);
    const gone = await sendToWordPress(member.cookie, spoke);

    expect(published.status).toBe(200);
    expect(afterPublished.wp_post_id).toBe(58);
    expect(gone.status).toBe(200);
    expect(callsOf()).toEqual([`GET ${POSTS}/57?context=edit`, `POST ${POSTS}`, `GET ${POSTS}/58?context=edit`, `POST ${POSTS}`]);
    expect(sentPost(fetchMock.mock.calls[1][1]).status).toBe("draft");
    expect(await articleRow(articleId)).toEqual({ wp_post_id: 59, wp_post_url: `${SITE_URL}/?p=59` });
  });

  it("un altro status è 502 WP_REJECTED; un utente di un altro workspace riceve 404; un nuovo sito toglie gli id delle bozze", async () => {
    const { owner, member, spoke, articleId, plan } = await readySpoke("t4602-rejected");
    const stranger = await createUserWithSession({ displayName: `t4602-other-${randomUUID().slice(0, 8)}` });
    fetchMock.mockResolvedValueOnce(Response.json({ code: "rest_invalid_param" }, { status: 400 }));

    const rejected = await sendToWordPress(member.cookie, spoke);
    const other = await sendToWordPress(stranger.cookie, spoke);
    await prisma.article.update({ where: { id: articleId }, data: { wp_post_id: 57, wp_post_url: `${SITE_URL}/?p=57` } });
    const sameSite = await putConnection(owner.cookie, plan.projectId, { siteUrl: SITE_URL, username: "redazione", appPassword: APP_PASSWORD });
    const afterSameSite = await articleRow(articleId);
    const newSite = await putConnection(owner.cookie, plan.projectId, { siteUrl: "https://nuovo.esempio.it", username: "redazione", appPassword: APP_PASSWORD });

    expect(rejected.status).toBe(502);
    expect(((await rejected.json()) as { code: string }).code).toBe("WP_REJECTED");
    expect(other.status).toBe(404);
    expect([sameSite.status, newSite.status]).toEqual([200, 200]);
    expect(afterSameSite.wp_post_id).toBe(57);
    expect(await articleRow(articleId)).toEqual({ wp_post_id: null, wp_post_url: null });
  });
});
