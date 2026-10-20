// Gate di T-4402 (AC-4402-3): il riquadro «Controllo SEO» dell'editor elenca la keyword mancante del blocco e il link
// obbligatorio mancante con l'H1 della pagina pilastro. In più keyword usate, densità, lunghezze delle meta, link
// presenti e segnaposto da verificare aperti.
import { fireEvent, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { ArticleSeoReport } from "@/components/article/article-seo-report";
import type { ArticleView } from "@/lib/articles/view";
import { renderWithIntl } from "./intl";

const PILLAR = "Noleggio letti ospedalieri: la guida completa";
const MISSING = "noleggio letto ospedaliero roma";

const ARTICLE: ArticleView = {
  id: "a1",
  pageId: "pg1",
  status: "READY",
  length: "MEDIUM",
  notes: null,
  errorCode: null,
  metaTitle: "Noleggio letto ospedaliero a Roma",
  metaDescription: "Come funziona il noleggio di un letto ospedaliero a Roma.",
  slug: "noleggio-letto-ospedaliero-roma",
  outline: {
    model: "autore/modello:free",
    blocks: [
      { position: 0, kind: "INTRO", heading: null, covers: "Cos'è", keywords: [MISSING, "noleggio letti ospedalieri"], words: 120, links: ["hub1"] },
      { position: 1, kind: "H2", heading: "Quanto costa", covers: "Prezzi", keywords: ["prezzo noleggio letto"], words: 200, links: ["sp2"] },
    ],
  },
  images: [],
  seoReport: {
    version: 1,
    density: 1.4,
    problems: [{ rule: "main_keyword_meta_description" }],
    blocks: [{ position: 0, problems: [{ rule: "keyword_missing", keyword: MISSING }, { rule: "link_missing", pageId: "hub1" }] }],
  },
  version: 2,
  createdAt: "2026-10-20T08:00:00.000Z",
  updatedAt: "2026-10-20T08:05:00.000Z",
  sections: [
    {
      id: "s0",
      position: 0,
      kind: "INTRO",
      heading: null,
      body: "Il noleggio di letti ospedalieri è semplice.",
      checks: { version: 1, matches: [], words: 7, score: 0, overLimit: false, problems: [], rewritten: false },
      edited: false,
      model: null,
      updatedAt: "2026-10-20T08:05:00.000Z",
    },
    {
      id: "s1",
      position: 1,
      kind: "H2",
      heading: "Quanto costa",
      body: "Il prezzo del noleggio di un letto parte da 90 euro, vedi [le altre zone](page:sp2).",
      checks: { version: 1, matches: [{ kind: "to_verify", rule: "amount", start: 44, end: 51 }], words: 15, score: 0, overLimit: false, problems: [], rewritten: false },
      edited: false,
      model: null,
      updatedAt: "2026-10-20T08:05:00.000Z",
    },
  ],
  run: null,
};

describe("riquadro «Controllo SEO»", () => {
  // covers: AC-4402-3
  it("elenca la keyword mancante e il link mancante con l'H1 della pagina pilastro", () => {
    const { container } = renderWithIntl(
      <ArticleSeoReport article={ARTICLE} pages={{ hub1: PILLAR, sp2: "Noleggio letti ospedalieri a Milano" }} mainKeyword={MISSING} />
    );
    const details = container.querySelector("details");
    expect(details).not.toBeNull();
    expect(details).not.toHaveAttribute("open");

    fireEvent.click(screen.getByText("Controllo SEO"));

    expect(details).toHaveAttribute("open");
    const intro = screen.getByRole("region", { name: "Introduzione" });
    expect(intro).toHaveTextContent(`Keyword mancanti: ${MISSING}`);
    expect(intro).toHaveTextContent("Keyword usate: noleggio letti ospedalieri");
    expect(intro).toHaveTextContent(`Link obbligatori mancanti: ${PILLAR}`);
    const second = screen.getByRole("region", { name: "Quanto costa" });
    expect(second).toHaveTextContent("Link interni presenti: Noleggio letti ospedalieri a Milano");
    expect(details).toHaveTextContent(`Densità di «${MISSING}»: 1,4 ogni 100 parole`);
    expect(details).toHaveTextContent("Title: 33 caratteri su 60");
    expect(details).toHaveTextContent("Meta description: 57 caratteri su 155");
    expect(details).toHaveTextContent("Dati da verificare aperti: 1");
    expect(details).toHaveTextContent("La keyword principale non è nella meta description");
  });
});
