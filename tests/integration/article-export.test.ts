// Gate di T-4501 (AC-4501-4): l'export dell'articolo si scarica con i permessi di lettura del progetto, come allegato
// con il nome dallo slug; un utente di un altro workspace riceve 404. In più l'HTML con i link risolti e il formato
// sconosciuto.
import { randomUUID } from "node:crypto";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { prisma } from "@/lib/prisma";
import { memberWithPlan } from "../helpers/ai-titles";
import { exportArticle, insertReadyArticle } from "../helpers/articles";
import { createUserWithSession } from "../helpers/auth";
import { resetDatabase } from "../helpers/db";

beforeAll(() => {
  vi.stubEnv("APP_AUTH_ENABLED", "true");
});

beforeEach(async () => {
  await resetDatabase();
});

/** Spoke con l'articolo pronto e un link alla sua pilastro, nel progetto con l'indirizzo del sito. */
async function exportedSpoke(label: string) {
  const setup = await memberWithPlan(`${label}-${randomUUID().slice(0, 8)}`);
  await prisma.project.update({ where: { id: setup.plan.projectId }, data: { site_url: "https://www.esempio.it" } });
  await insertReadyArticle(setup.spoke, {
    slug: "scarpe-running-donna",
    sections: [
      { kind: "INTRO", body: `Parti dalla [guida alle scarpe](page:${setup.plan.pageIds.hub}).` },
      { kind: "H2", heading: "Come scegliere la taglia", body: "Misura il piede la sera." },
    ],
  });
  return setup;
}

describe("export dell'articolo", () => {
  // covers: AC-4501-4
  it("il MEMBER riceve il Markdown come allegato con il nome dallo slug, l'utente di un altro workspace 404", async () => {
    const { member, spoke } = await exportedSpoke("t4501");
    const stranger = await createUserWithSession({ displayName: `t4501-other-${randomUUID().slice(0, 8)}` });

    const response = await exportArticle(member.cookie, spoke, "md");
    const other = await exportArticle(stranger.cookie, spoke, "md");

    expect(response.status).toBe(200);
    expect(response.headers.get("Content-Disposition")).toBe('attachment; filename="scarpe-running-donna.md"');
    expect(response.headers.get("Content-Type")).toBe("text/markdown; charset=utf-8");
    expect(await response.text()).toContain("## Come scegliere la taglia");
    expect(other.status).toBe(404);
  });

  it("l'HTML risolve il link alla pilastro con il sito più lo slug della keyword principale; un formato sconosciuto è 400", async () => {
    const { member, spoke } = await exportedSpoke("t4501-html");

    const html = await exportArticle(member.cookie, spoke, "html");
    const invalid = await exportArticle(member.cookie, spoke, "pdf");

    expect(html.status).toBe(200);
    expect(html.headers.get("Content-Disposition")).toBe('attachment; filename="scarpe-running-donna.html"');
    expect(await html.text()).toContain('<a href="https://www.esempio.it/scarpe-running/">guida alle scarpe</a>');
    expect(invalid.status).toBe(400);
    expect(((await invalid.json()) as { code: string }).code).toBe("EXPORT_FORMAT_INVALID");
  });
});
