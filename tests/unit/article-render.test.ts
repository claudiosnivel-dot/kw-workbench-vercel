// Gate di T-4501 (AC-4501-1, AC-4501-2, AC-4501-3): l'HTML dell'articolo risolve i link interni con l'indirizzo
// pubblicato, poi con il sito più lo slug, poi con /slug/; ha un solo script JSON-LD con Article, FAQPage e
// BreadcrumbList e i segnaposto immagine come commenti; un testo con </script> resta testo e nel JSON '<' è \u003c. In
// più il Markdown, LocalBusiness per la pagina locale e l'elenco chiuso di tag e attributi.
import { describe, expect, it } from "vitest";
import { type ArticleExport, renderArticleHtml, renderArticleMarkdown } from "@/lib/articles/render";

const FAQ_BODY = [
  "**Quanto costa il noleggio?**",
  "Dipende dalla durata del noleggio.",
  "**Serve la prescrizione?**",
  "Non sempre: chiedi al medico.",
  "**Chi porta il letto?**",
  "Lo consegna il negozio a casa.",
].join("\n\n");

function article(overrides: Partial<ArticleExport> = {}): ArticleExport {
  return {
    h1: "Letto elettrico a noleggio: come funziona",
    language: "it",
    metaDescription: "Come noleggiare un letto elettrico per la casa.",
    sections: [
      {
        position: 0,
        kind: "INTRO",
        heading: null,
        body: "Leggi la [guida al noleggio](page:hub) e la scheda del [letto elettrico](page:other).",
      },
      { position: 1, kind: "H2", heading: "Come scegliere", body: "Conta **la misura** e il *motore*.\n\n- primo punto\n- secondo punto" },
      { position: 2, kind: "FAQ", heading: "Domande frequenti", body: FAQ_BODY },
    ],
    images: [{ position: 1, cover: false, purpose: "Misure", alt: "Letto elettrico in camera", fileName: "letto-2.webp", prompt: "A hospital bed at home" }],
    siteUrl: "https://www.esempio.it",
    pages: {
      hub: { publishedUrl: "https://www.esempio.it/noleggio/", slug: "noleggio-ausili" },
      spoke: { publishedUrl: null, slug: "letto-elettrico-noleggio" },
      other: { publishedUrl: null, slug: "letto-elettrico" },
    },
    breadcrumb: [
      { pageId: "hub", name: "Noleggio ausili" },
      { pageId: "spoke", name: "Letto elettrico a noleggio: come funziona" },
    ],
    business: null,
    ...overrides,
  };
}

const hrefs = (html: string) => [...html.matchAll(/<a href="([^"]*)">/g)].map((match) => match[1]);
const scripts = (html: string) => [...html.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/gi)];

function graph(html: string): Record<string, unknown>[] {
  const [script] = scripts(html);
  return (JSON.parse(script[1]) as { "@graph": Record<string, unknown>[] })["@graph"];
}

const ofType = (html: string, type: string) => graph(html).find((node) => node["@type"] === type);

describe("HTML dell'articolo", () => {
  // covers: AC-4501-1
  it("il link alla pilastro usa l'indirizzo pubblicato, quello allo spoke il sito più lo slug, senza sito /slug/", () => {
    expect(hrefs(renderArticleHtml(article()))).toEqual(["https://www.esempio.it/noleggio/", "https://www.esempio.it/letto-elettrico/"]);
    expect(hrefs(renderArticleHtml(article({ siteUrl: null })))).toEqual(["https://www.esempio.it/noleggio/", "/letto-elettrico/"]);
  });

  // covers: AC-4501-2
  it("un solo script JSON-LD con Article, FAQPage con 3 domande e BreadcrumbList con 2 elementi, e il segnaposto come commento", () => {
    const html = renderArticleHtml(article());

    expect(scripts(html)).toHaveLength(1);
    expect(scripts(html)[0][0]).toMatch(/^<script type="application\/ld\+json">/);
    expect(ofType(html, "Article")).toMatchObject({ headline: "Letto elettrico a noleggio: come funziona", inLanguage: "it" });
    expect((ofType(html, "FAQPage")?.mainEntity as { name: string }[]).map((question) => question.name)).toEqual([
      "Quanto costa il noleggio?",
      "Serve la prescrizione?",
      "Chi porta il letto?",
    ]);
    expect(ofType(html, "BreadcrumbList")?.itemListElement).toEqual([
      { "@type": "ListItem", position: 1, name: "Noleggio ausili", item: "https://www.esempio.it/noleggio/" },
      { "@type": "ListItem", position: 2, name: "Letto elettrico a noleggio: come funziona", item: "https://www.esempio.it/letto-elettrico-noleggio/" },
    ]);
    const comments = [...html.matchAll(/<!--([\s\S]*?)-->/g)].map((match) => match[1]);
    expect(comments).toHaveLength(1);
    expect(comments[0]).toContain("Letto elettrico in camera");
    expect(comments[0]).toContain("A hospital bed at home");
  });

  // covers: AC-4501-3
  it("un </script> nella risposta di una FAQ resta testo: un solo tag script e \\u003c/script> nel JSON", () => {
    const body = "**Si può smontare?**\n\nSì. </script><script>alert(1)</script>";
    const html = renderArticleHtml(article({ sections: [{ position: 0, kind: "FAQ", heading: "Domande frequenti", body }] }));

    expect(html.match(/<script/gi)).toHaveLength(1);
    expect(scripts(html)[0][0]).toMatch(/^<script type="application\/ld\+json">/);
    expect(scripts(html)[0][1]).toContain("\\u003c/script>");
    expect(scripts(html)[0][1]).not.toContain("<");
    expect(html).toContain("&lt;/script&gt;&lt;script&gt;alert(1)&lt;/script&gt;");
  });

  it("solo i tag dell'elenco chiuso e il solo attributo href, H1, H2 nell'ordine e l'introduzione senza titolo", () => {
    const html = renderArticleHtml(article());
    const tags = new Set([...html.matchAll(/<\/?([a-z0-9]+)/g)].map((match) => match[1]));
    const attributes = [...html.matchAll(/<(?!script)[a-z0-9]+\s+([a-z-]+)=/g)].map((match) => match[1]);

    expect([...tags].sort()).toEqual(["a", "em", "h1", "h2", "li", "p", "script", "strong", "ul"]);
    expect(new Set(attributes)).toEqual(new Set(["href"]));
    expect([...html.matchAll(/<h([12])>([^<]*)<\/h\1>/g)].map((match) => match[2])).toEqual([
      "Letto elettrico a noleggio: come funziona",
      "Come scegliere",
      "Domande frequenti",
    ]);
  });

  it("LocalBusiness solo con nome e indirizzo dell'attività; i '--' del prompt non chiudono il commento", () => {
    const local = article({
      business: { name: "Ortopedia Rossi", address: "Via Roma 1, Milano" },
      images: [{ position: 1, cover: true, purpose: "Copertina", alt: "Letto", fileName: "letto.webp", prompt: "bed --> <script>" }],
    });
    const html = renderArticleHtml(local);

    expect(ofType(html, "LocalBusiness")).toEqual({ "@type": "LocalBusiness", name: "Ortopedia Rossi", address: "Via Roma 1, Milano" });
    expect(ofType(renderArticleHtml(article()), "LocalBusiness")).toBeUndefined();
    expect(html.match(/-->/g)).toHaveLength(1);
    expect(html.match(/<script/gi)).toHaveLength(1);
  });
});

describe("Markdown dell'articolo", () => {
  it("H1, H2, link risolti e il segnaposto immagine come citazione dopo il suo blocco", () => {
    const markdown = renderArticleMarkdown(article());

    expect(markdown.startsWith("# Letto elettrico a noleggio: come funziona\n\n")).toBe(true);
    expect(markdown).toContain("[guida al noleggio](https://www.esempio.it/noleggio/)");
    expect(markdown).toContain("[letto elettrico](https://www.esempio.it/letto-elettrico/)");
    expect(markdown).not.toContain("page:");
    expect(markdown).toContain(
      "- secondo punto\n\n> Immagine 1 | Testo alternativo: Letto elettrico in camera | File: letto-2.webp | Prompt: A hospital bed at home\n\n## Domande frequenti"
    );
  });
});
