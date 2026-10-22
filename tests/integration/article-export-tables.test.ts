// Gate di T-5601 (AC-5601-1, AC-5601-2, AC-5601-3): la tabella di un blocco arriva nell'export HTML come <table> con
// l'intestazione, il corpo e il link della cella risolto con l'indirizzo pubblicato, nel Markdown come tabella GFM con il
// link risolto; il testo di una cella salvata nel database con un tag resta testo.
import { randomUUID } from "node:crypto";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { prisma } from "@/lib/prisma";
import { memberWithPlan } from "../helpers/ai-titles";
import { exportArticle, insertReadyArticle } from "../helpers/articles";
import { resetDatabase } from "../helpers/db";

beforeAll(() => {
  vi.stubEnv("APP_AUTH_ENABLED", "true");
});

beforeEach(async () => {
  await resetDatabase();
});

const PUBLISHED = "https://www.esempio.it/scarpe-running/";

/** Spoke con l'articolo pronto e un blocco con la tabella data; la pilastro è segnata come pubblicata. */
async function articleWithTable(label: string, table: (hubId: string) => string) {
  const setup = await memberWithPlan(`${label}-${randomUUID().slice(0, 8)}`);
  await prisma.strategyPage.update({ where: { id: setup.plan.pageIds.hub }, data: { published_url: PUBLISHED } });
  await insertReadyArticle(setup.spoke, {
    slug: "scarpe-running-donna",
    sections: [
      { kind: "INTRO", body: "Scegliere la scarpa giusta parte dal piede." },
      { kind: "H2", heading: "Modelli a confronto", body: `Ecco i due modelli.\n\n${table(setup.plan.pageIds.hub)}\n\nPoi provali in negozio.` },
    ],
  });
  return setup;
}

const modelsTable = (hubId: string) =>
  ["| Modello | Dove leggere |", "| --- | --- |", `| Neutra | [guida alle scarpe](page:${hubId}) |`, "| Stabile | **Ammortizzata** |"].join("\n");

const tables = (html: string) => [...html.matchAll(/<table>[\s\S]*?<\/table>/g)].map((match) => match[0]);
const count = (text: string, pattern: RegExp) => text.match(pattern)?.length ?? 0;

describe("tabelle nell'export dell'articolo", () => {
  // covers: AC-5601-1
  it("nell'HTML la tabella ha un <thead> di 2 <th>, 2 righe nel <tbody> e il link della cella con l'indirizzo pubblicato", async () => {
    const { member, spoke } = await articleWithTable("t5601-html", modelsTable);

    const response = await exportArticle(member.cookie, spoke, "html");

    expect(response.status).toBe(200);
    const [table, ...others] = tables(await response.text());
    expect(others).toEqual([]);
    const thead = /<thead>([\s\S]*?)<\/thead>/.exec(table)?.[1] ?? "";
    const tbody = /<tbody>([\s\S]*?)<\/tbody>/.exec(table)?.[1] ?? "";
    expect(count(thead, /<th>/g)).toBe(2);
    expect(thead).toContain("<th>Modello</th><th>Dove leggere</th>");
    expect(count(tbody, /<tr>/g)).toBe(2);
    expect(tbody).toContain(`<td><a href="${PUBLISHED}">guida alle scarpe</a></td>`);
    expect(tbody).toContain("<td><strong>Ammortizzata</strong></td>");
  });

  // covers: AC-5601-2
  it("nel Markdown la tabella ha l'intestazione, la riga di separazione e le 2 righe di dati con il link risolto", async () => {
    const { member, spoke } = await articleWithTable("t5601-md", modelsTable);

    const response = await exportArticle(member.cookie, spoke, "md");

    expect(response.status).toBe(200);
    const markdown = await response.text();
    expect(markdown).toContain(
      ["| Modello | Dove leggere |", "| --- | --- |", `| Neutra | [guida alle scarpe](${PUBLISHED}) |`, "| Stabile | **Ammortizzata** |"].join("\n")
    );
    expect(markdown).toContain("Ecco i due modelli.\n\n| Modello");
    expect(markdown).toContain("| Stabile | **Ammortizzata** |\n\nPoi provali in negozio.");
    expect(markdown).not.toContain("page:");
  });

  // covers: AC-5601-3
  it("una cella salvata nel database con <script> resta testo: &lt;script&gt; nella cella e il solo script dei dati strutturati", async () => {
    const { member, spoke } = await articleWithTable("t5601-xss", () =>
      ["| Campo | Valore |", "| --- | --- |", "| Nota | <script>alert(1)</script> |"].join("\n")
    );

    const response = await exportArticle(member.cookie, spoke, "html");

    expect(response.status).toBe(200);
    const html = await response.text();
    expect(tables(html)[0]).toContain("<td>&lt;script&gt;alert(1)&lt;/script&gt;</td>");
    const scripts = [...html.matchAll(/<script\b[^>]*>/gi)].map((match) => match[0]);
    expect(scripts).toEqual(['<script type="application/ld+json">']);
  });
});
