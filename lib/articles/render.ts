import { fromMarkdown } from "mdast-util-from-markdown";
import type { ArticleImageView } from "@/lib/articles/view";
import type { ArticleSectionKind } from "@/lib/generated/prisma/enums";

/*
 * Export dell'articolo (T-4501, D-46): HTML e Markdown da incollare nel sito, con i link interni page:<id> risolti, i
 * segnaposto immagine e i dati strutturati in un solo script JSON-LD. L'HTML nasce solo dal Markdown dei blocchi, già
 * ripulito (T-4201), con un elenco chiuso di tag e il solo attributo href; ogni altro nodo resta testo, con i caratteri
 * speciali scritti come entità (CWE-79), e dentro il JSON ogni '<' è <. Modulo puro: lo usano la rotta dell'export
 * e il file Word (T-4502).
 */

/** Nodo dell'albero del Markdown (mdast) nella sola forma che serve qui. */
export type MdNode = { type: string; value?: string; url?: string; depth?: number; ordered?: boolean | null; spread?: boolean | null; children?: MdNode[] };

type ExportSection = { position: number; kind: ArticleSectionKind; heading: string | null; body: string };

/** Pagina del piano come destinazione di un link: indirizzo pubblicato (T-4502) e slug del suo articolo. */
type ExportLinkTarget = { publishedUrl: string | null; slug: string };

export type ArticleExport = {
  h1: string;
  /** Lingua del piano (inLanguage dell'Article e testi dei segnaposto immagine). */
  language: string;
  metaDescription: string | null;
  sections: ExportSection[];
  images: ArticleImageView[];
  siteUrl: string | null;
  /** Pagine del piano per id: i link [testo](page:<id>) e le briciole. */
  pages: Record<string, ExportLinkTarget>;
  /** Dalla pagina pilastro alla pagina dell'articolo: due voci per uno spoke, una per una pilastro. */
  breadcrumb: { pageId: string; name: string }[];
  /** Nome e indirizzo dell'attività per una pagina locale (LocalBusiness), altrimenti null. */
  business: { name: string; address: string } | null;
};

type ImageLabels = { image: string; cover: string; alt: string; file: string; prompt: string };

const IMAGE_LABELS: Record<string, ImageLabels> = {
  it: { image: "Immagine", cover: "copertina", alt: "Testo alternativo", file: "File", prompt: "Prompt" },
  es: { image: "Imagen", cover: "portada", alt: "Texto alternativo", file: "Archivo", prompt: "Prompt" },
  en: { image: "Image", cover: "cover", alt: "Alt text", file: "File", prompt: "Prompt" },
};

const PAGE_LINK = /^page:(.+)$/;
const MARKDOWN_PAGE_LINK = /\[([^[\]]*)\]\((page:[^()\s]+)\)/g;
/** Nodi che contengono testo in linea: i figli si uniscono senza spazio. */
const INLINE_PARENTS = new Set(["paragraph", "heading", "strong", "emphasis", "delete", "link", "linkReference"]);
/** Nodi di blocco scritti come testo semplice: HTML grezzo e codice. */
const BLOCK_TEXT = new Set(["html", "code"]);

/** Indirizzo di una pagina del piano: quello pubblicato, altrimenti il sito più lo slug, altrimenti /slug/. */
function pageUrl(target: ExportLinkTarget, siteUrl: string | null): string {
  return target.publishedUrl ?? `${siteUrl ?? ""}/${target.slug}/`;
}

/** Destinazione di un link page:<id> verso una pagina del piano; null per ogni altro indirizzo. */
export function linkHref(url: string, article: ArticleExport): string | null {
  const pageId = PAGE_LINK.exec(url)?.[1];
  return pageId && Object.hasOwn(article.pages, pageId) ? pageUrl(article.pages[pageId], article.siteUrl) : null;
}

export const parseMarkdown = (body: string): MdNode => fromMarkdown(body) as MdNode;

/** Testo semplice di un nodo, anche quello che il Markdown leggerebbe come HTML, con gli spazi ridotti. */
function plainText(node: MdNode): string {
  if (node.type === "text" || node.type === "inlineCode" || node.type === "html" || node.type === "code") return node.value ?? "";
  if (node.type === "break") return " ";
  const joiner = INLINE_PARENTS.has(node.type) ? "" : " ";
  return (node.children ?? [])
    .map(plainText)
    .join(joiner)
    .replace(/\s+/g, " ")
    .trim();
}

/** Domande e risposte del blocco FAQ (T-4202): un paragrafo tutto in grassetto è una domanda, i blocchi che seguono la risposta. */
function faqPairs(body: string): { question: string; answer: string }[] {
  const pairs: { question: string; answer: string }[] = [];
  for (const node of parseMarkdown(body).children ?? []) {
    if (node.type === "paragraph" && node.children?.length === 1 && node.children[0].type === "strong") {
      pairs.push({ question: plainText(node), answer: "" });
    } else if (pairs.length > 0) {
      const last = pairs[pairs.length - 1];
      last.answer = [last.answer, plainText(node)].filter(Boolean).join(" ");
    }
  }
  return pairs.filter((pair) => pair.question && pair.answer);
}

/** Segnaposto immagine da mettere dopo il blocco della posizione, con il numero nell'ordine della scaletta. */
export function imagesAfter(article: ArticleExport, position: number): { number: number; image: ArticleImageView }[] {
  return article.images.flatMap((image, index) => (image.position === position ? [{ number: index + 1, image }] : []));
}

/** Riga del segnaposto immagine nella lingua del piano: numero, copertina, testo alternativo, nome del file e prompt. */
export function imageLine(article: ArticleExport, { number, image }: { number: number; image: ArticleImageView }): string {
  const labels = IMAGE_LABELS[article.language] ?? IMAGE_LABELS.en;
  const title = `${labels.image} ${number}${image.cover ? ` (${labels.cover})` : ""}`;
  return [title, `${labels.alt}: ${image.alt}`, `${labels.file}: ${image.fileName}`, `${labels.prompt}: ${image.prompt}`].join(" | ").replace(/\s+/g, " ");
}

const escapeHtml = (text: string) => text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

/**
 * Testo dentro un commento HTML: senza '--', così il commento non si chiude né si rompe prima della fine, e con '<' e
 * '>' come entità, così nessun tag compare neppure dentro il commento.
 */
const commentText = (text: string) => text.replace(/-{2,}/g, "-").replace(/</g, "&lt;").replace(/>/g, "&gt;");

function blocksHtml(nodes: MdNode[], article: ArticleExport, tight: boolean, joiner: string): string {
  return nodes.map((node) => (BLOCK_TEXT.has(node.type) ? `<p>${escapeHtml(node.value ?? "")}</p>` : nodeHtml(node, article, tight))).join(joiner);
}

/** HTML di un nodo con i soli tag p, h3-h6, ul, ol, li, blockquote, strong, em, br e a con href. */
function nodeHtml(node: MdNode, article: ArticleExport, tight = false): string {
  const children = node.children ?? [];
  const inline = () => children.map((child) => nodeHtml(child, article)).join("");
  switch (node.type) {
    case "root":
      return blocksHtml(children, article, false, "\n");
    case "paragraph":
      return tight ? inline() : `<p>${inline()}</p>`;
    case "heading": {
      const level = Math.min(6, Math.max(3, node.depth ?? 3));
      return `<h${level}>${inline()}</h${level}>`;
    }
    case "list": {
      const tag = node.ordered ? "ol" : "ul";
      return `<${tag}>\n${children.map((item) => nodeHtml(item, article, !node.spread)).join("\n")}\n</${tag}>`;
    }
    case "listItem":
      return `<li>${blocksHtml(children, article, tight, tight ? " " : "\n")}</li>`;
    case "blockquote":
      return `<blockquote>\n${blocksHtml(children, article, false, "\n")}\n</blockquote>`;
    case "strong":
      return `<strong>${inline()}</strong>`;
    case "emphasis":
      return `<em>${inline()}</em>`;
    case "break":
      return "<br>";
    case "link": {
      const href = linkHref(node.url ?? "", article);
      return href ? `<a href="${escapeHtml(href)}">${inline()}</a>` : inline();
    }
    case "text":
    case "inlineCode":
    case "html":
    case "code":
      return escapeHtml(node.value ?? "");
    default:
      // Riferimenti e testo barrato tengono il contenuto; immagini, definizioni e separatori non ne hanno.
      return inline();
  }
}

/** Dati strutturati dell'articolo: Article, FAQPage, BreadcrumbList e, per una pagina locale, LocalBusiness. */
function jsonLd(article: ArticleExport): string {
  const graph: Record<string, unknown>[] = [
    { "@type": "Article", headline: article.h1, ...(article.metaDescription ? { description: article.metaDescription } : {}), inLanguage: article.language },
  ];
  const faq = article.sections.filter((section) => section.kind === "FAQ").flatMap((section) => faqPairs(section.body));
  if (faq.length > 0) {
    graph.push({
      "@type": "FAQPage",
      mainEntity: faq.map((pair) => ({ "@type": "Question", name: pair.question, acceptedAnswer: { "@type": "Answer", text: pair.answer } })),
    });
  }
  const crumbs = article.breadcrumb.filter((crumb) => Object.hasOwn(article.pages, crumb.pageId));
  if (crumbs.length > 0) {
    graph.push({
      "@type": "BreadcrumbList",
      itemListElement: crumbs.map((crumb, index) => ({
        "@type": "ListItem",
        position: index + 1,
        name: crumb.name,
        item: pageUrl(article.pages[crumb.pageId], article.siteUrl),
      })),
    });
  }
  if (article.business) graph.push({ "@type": "LocalBusiness", name: article.business.name, address: article.business.address });
  return JSON.stringify({ "@context": "https://schema.org", "@graph": graph }).replace(/</g, "\\u003c");
}

/**
 * HTML dell'articolo da incollare nel sito (T-4501): H1, i blocchi nell'ordine (l'introduzione senza titolo, un H2 per
 * blocco, le domande frequenti), i segnaposto immagine come commenti dopo il loro blocco e lo script JSON-LD in fondo.
 */
export function renderArticleHtml(article: ArticleExport): string {
  const parts = [`<h1>${escapeHtml(article.h1)}</h1>`];
  for (const section of article.sections) {
    if (section.kind !== "INTRO" && section.heading) parts.push(`<h2>${escapeHtml(section.heading)}</h2>`);
    if (section.body.trim()) parts.push(nodeHtml(parseMarkdown(section.body), article));
    for (const item of imagesAfter(article, section.position)) parts.push(`<!-- ${commentText(imageLine(article, item))} -->`);
  }
  parts.push(`<script type="application/ld+json">${jsonLd(article)}</script>`);
  return `${parts.join("\n")}\n`;
}

/** Markdown dell'articolo (T-4501): gli stessi blocchi con i link risolti e i segnaposto immagine come citazioni. */
export function renderArticleMarkdown(article: ArticleExport): string {
  const parts = [`# ${article.h1}`];
  for (const section of article.sections) {
    if (section.kind !== "INTRO" && section.heading) parts.push(`## ${section.heading}`);
    const body = section.body.trim().replace(MARKDOWN_PAGE_LINK, (_match, text: string, url: string) => {
      const href = linkHref(url, article);
      return href ? `[${text}](${href})` : text;
    });
    if (body) parts.push(body);
    for (const item of imagesAfter(article, section.position)) parts.push(`> ${imageLine(article, item)}`);
  }
  return `${parts.join("\n\n")}\n`;
}
