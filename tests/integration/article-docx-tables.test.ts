// Gate di T-5602 (AC-5602-1): nel file Word la tabella del blocco è una w:tbl con la riga d'intestazione ripetuta
// (w:tblHeader), le celle nell'ordine della tabella, l'intestazione in grassetto e il link di una cella risolto.
import { randomUUID } from "node:crypto";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { prisma } from "@/lib/prisma";
import { memberWithPlan } from "../helpers/ai-titles";
import { exportArticle, insertReadyArticle } from "../helpers/articles";
import { resetDatabase } from "../helpers/db";
import { unzip } from "../helpers/zip";

beforeAll(() => {
  vi.stubEnv("APP_AUTH_ENABLED", "true");
});

beforeEach(async () => {
  await resetDatabase();
});

const matches = (xml: string, pattern: RegExp) => [...xml.matchAll(pattern)].map((match) => match[0]);
const text = (xml: string) => matches(xml, /<w:t(?: [^>]*)?>[^<]*<\/w:t>/g).map((run) => run.replace(/<[^>]+>/g, "")).join("");

describe("tabelle nel file Word dell'articolo", () => {
  // covers: AC-5602-1
  it("la tabella di 3 colonne e 2 righe di dati è una w:tbl di 3 righe da 3 celle, con la prima riga w:tblHeader", async () => {
    const { member, plan, spoke } = await memberWithPlan(`t5602-docx-${randomUUID().slice(0, 8)}`);
    await prisma.strategyPage.update({ where: { id: plan.pageIds.hub }, data: { published_url: "https://www.esempio.it/scarpe-running/" } });
    await insertReadyArticle(spoke, {
      slug: "scarpe-running-donna",
      sections: [
        {
          kind: "H2",
          heading: "Modelli a confronto",
          body: [
            "Ecco i due modelli.",
            "",
            "| Modello | Peso | Prezzo |",
            "| :--- | :---: | ---: |",
            `| [Neutra](page:${plan.pageIds.hub}) | 250 g | **120 €** |`,
            "| Stabile | 290 g | *140 €* |",
          ].join("\n"),
        },
      ],
    });

    const response = await exportArticle(member.cookie, spoke, "docx");

    expect(response.status).toBe(200);
    const files = unzip(Buffer.from(await response.arrayBuffer()));
    const document = files.get("word/document.xml") ?? "";
    const [table, ...others] = matches(document, /<w:tbl>[\s\S]*?<\/w:tbl>/g);
    expect(others).toEqual([]);
    const rows = matches(table, /<w:tr[ >][\s\S]*?<\/w:tr>/g);
    expect(rows).toHaveLength(3);
    const cells = rows.map((row) => matches(row, /<w:tc>[\s\S]*?<\/w:tc>/g));
    expect(cells.map((row) => row.length)).toEqual([3, 3, 3]);
    expect(rows.map((row) => row.includes("<w:tblHeader/>"))).toEqual([true, false, false]);
    expect(cells.map((row) => row.map(text))).toEqual([
      ["Modello", "Peso", "Prezzo"],
      ["Neutra", "250 g", "120 €"],
      ["Stabile", "290 g", "140 €"],
    ]);
    expect(cells[0].every((cell) => cell.includes("<w:b/>"))).toBe(true);
    expect(cells[1][0]).toContain("<w:hyperlink");
    expect(files.get("word/_rels/document.xml.rels")).toContain('Target="https://www.esempio.it/scarpe-running/"');
  });
});
