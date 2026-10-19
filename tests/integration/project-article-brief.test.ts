// Gate di T-4001 (AC-4001-1, AC-4001-2): la PATCH del progetto salva la scheda «Per gli articoli» con gli spazi tolti ai
// lati e l'indirizzo del sito senza barra finale; un indirizzo non https, con credenziali o non web e un testo oltre il
// limite sono 400 VALIDATION_ERROR e il progetto non cambia.
import { randomUUID } from "node:crypto";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { PATCH as patchProject } from "@/app/api/projects/[id]/route";
import { prisma } from "@/lib/prisma";
import { createUserWithSession } from "../helpers/auth";
import { resetDatabase } from "../helpers/db";
import { callRoute } from "../helpers/http";

type ErrorBody = { code?: string };

beforeAll(() => {
  vi.stubEnv("APP_AUTH_ENABLED", "true");
});

beforeEach(async () => {
  await resetDatabase();
});

async function ownerWithProject() {
  const owner = await createUserWithSession({ displayName: `t4001-${randomUUID().slice(0, 8)}` });
  const project = await prisma.project.create({ data: { name: "Letti ospedalieri", workspace_id: owner.workspaceId, language_code: "it" } });
  return { owner, projectId: project.id };
}

function patchAs(cookie: string, projectId: string, body: unknown) {
  return callRoute(patchProject, { method: "PATCH", url: `/api/projects/${projectId}`, cookie, params: { id: projectId }, body });
}

const brief = (projectId: string) =>
  prisma.project.findUniqueOrThrow({
    where: { id: projectId },
    select: {
      article_about: true,
      article_audience: true,
      article_tone: true,
      business_name: true,
      business_address: true,
      site_url: true,
      name: true,
    },
  });

describe("scheda «Per gli articoli» del progetto", () => {
  // covers: AC-4001-1
  it("salva i testi senza spazi ai lati, il tono e l'indirizzo del sito senza barra finale", async () => {
    const { owner, projectId } = await ownerWithProject();

    const response = await patchAs(owner.cookie, projectId, {
      article_about: "  Noleggio letti ospedalieri a Roma  ",
      article_tone: "friendly",
      site_url: "https://www.esempio.it/",
    });

    expect(response.status).toBe(200);
    expect(await brief(projectId)).toEqual({
      article_about: "Noleggio letti ospedalieri a Roma",
      article_audience: null,
      article_tone: "friendly",
      business_name: null,
      business_address: null,
      site_url: "https://www.esempio.it",
      name: "Letti ospedalieri",
    });
  });

  // covers: AC-4001-1
  it("una stringa vuota o di soli spazi diventa null e un percorso del sito resta senza barra finale", async () => {
    const { owner, projectId } = await ownerWithProject();
    await patchAs(owner.cookie, projectId, { article_audience: "Famiglie", business_name: "Letti Roma" });

    const response = await patchAs(owner.cookie, projectId, {
      article_audience: "   ",
      business_name: "",
      business_address: " Via Appia 1, Roma ",
      site_url: "https://esempio.it/blog/",
    });

    expect(response.status).toBe(200);
    expect(await brief(projectId)).toMatchObject({
      article_audience: null,
      business_name: null,
      business_address: "Via Appia 1, Roma",
      site_url: "https://esempio.it/blog",
    });
  });

  // covers: AC-4001-2
  it("rifiuta http, credenziali, javascript: e un testo di 1001 caratteri con 400 VALIDATION_ERROR senza cambiare il progetto", async () => {
    const { owner, projectId } = await ownerWithProject();
    await patchAs(owner.cookie, projectId, { article_about: "Noleggio", site_url: "https://esempio.it" });
    const before = await brief(projectId);

    const responses = [
      await patchAs(owner.cookie, projectId, { site_url: "http://esempio.it" }),
      await patchAs(owner.cookie, projectId, { site_url: "https://utente:pw@esempio.it" }),
      await patchAs(owner.cookie, projectId, { site_url: "javascript:alert(1)" }),
      await patchAs(owner.cookie, projectId, { article_about: "a".repeat(1001), name: "Altro nome" }),
    ];

    const outcomes = await Promise.all(responses.map(async (response) => [response.status, ((await response.json()) as ErrorBody).code]));
    expect(outcomes).toEqual(Array.from({ length: 4 }, () => [400, "VALIDATION_ERROR"]));
    expect(await brief(projectId)).toEqual(before);
  });

  // covers: AC-4001-2
  it("rifiuta anche query, frammento e un tono fuori elenco", async () => {
    const { owner, projectId } = await ownerWithProject();

    const responses = [
      await patchAs(owner.cookie, projectId, { site_url: "https://esempio.it/?ref=1" }),
      await patchAs(owner.cookie, projectId, { site_url: "https://esempio.it/#chi-siamo" }),
      await patchAs(owner.cookie, projectId, { article_tone: "solenne" }),
    ];

    expect(responses.map((response) => response.status)).toEqual([400, 400, 400]);
    expect(await brief(projectId)).toMatchObject({ site_url: null, article_tone: "professional" });
  });
});
