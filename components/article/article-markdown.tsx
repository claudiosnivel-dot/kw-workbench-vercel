import { gfmTableFromMarkdown } from "mdast-util-gfm-table";
import { gfmTable } from "micromark-extension-gfm-table";
import Link from "next/link";
import type { ComponentPropsWithoutRef } from "react";
import Markdown, { type Components } from "react-markdown";
import type { CheckMatchView } from "@/lib/articles/view";
import { planHref } from "@/lib/modules/next-step";

/** Corrispondenza da evidenziare: posizione nel Markdown del blocco, classe e testo del title. */
export type ArticleMark = CheckMatchView & { label: string };

const MARK_CLASS: Record<CheckMatchView["kind"], string> = { ai_pattern: "article-mark-ai", to_verify: "article-mark-verify" };

// Nodi dell'albero HTML (hast) di react-markdown, nella sola forma che serve qui.
type HastText = { type: "text"; value: string; position?: { start: { offset?: number }; end: { offset?: number } } };
type HastElement = { type: "element"; tagName: string; properties: Record<string, unknown>; children: HastNode[] };
type HastNode = HastText | HastElement | { type: string; children?: HastNode[] };

const markElement = (mark: ArticleMark, value: string): HastElement => ({
  type: "element",
  tagName: "mark",
  properties: { className: ["article-mark", MARK_CLASS[mark.kind]], title: mark.label },
  children: [{ type: "text", value }],
});

/** Inizio del testo del nodo nel Markdown: dalla sua posizione se il sorgente coincide, altrimenti null. */
function sourceStart(node: HastText, markdown: string): number | null {
  const start = node.position?.start.offset;
  const end = node.position?.end.offset;
  if (start === undefined || end === undefined) return null;
  return markdown.slice(start, end) === node.value ? start : null;
}

/** Il testo del nodo diviso nelle parti dentro e fuori dalle corrispondenze che lo toccano. */
function splitText(node: HastText, start: number, marks: ArticleMark[]): HastNode[] {
  const end = start + node.value.length;
  const parts: HastNode[] = [];
  let cursor = start;
  for (const mark of marks) {
    const from = Math.max(mark.start, cursor);
    const to = Math.min(mark.end, end);
    if (to <= from) continue;
    if (from > cursor) parts.push({ type: "text", value: node.value.slice(cursor - start, from - start) });
    parts.push(markElement(mark, node.value.slice(from - start, to - start)));
    cursor = to;
  }
  if (parts.length === 0) return [node];
  if (cursor < end) parts.push({ type: "text", value: node.value.slice(cursor - start) });
  return parts;
}

/**
 * Plugin rehype dell'evidenziazione (T-4401): i nodi di testo che cadono dentro una corrispondenza dei controlli, per
 * posizione nel Markdown del blocco, diventano <mark> con la classe del tipo e la regola nel title. Un testo che non
 * coincide con il sorgente (per esempio con caratteri di escape) resta com'è.
 */
function highlightMarks(options: { markdown: string; marks: ArticleMark[] }) {
  const marks = [...options.marks].sort((a, b) => a.start - b.start);
  const visit = (node: HastNode) => {
    if (!("children" in node) || !node.children) return;
    node.children = node.children.flatMap((child) => {
      if (child.type !== "text") {
        visit(child);
        return [child];
      }
      const start = sourceStart(child as HastText, options.markdown);
      return start === null ? [child] : splitText(child as HastText, start, marks);
    });
  };
  return (tree: HastNode) => visit(tree);
}

/** Dati del parser che remark-parse legge: le estensioni di micromark e di mdast-util-from-markdown. */
type ParserData = { micromarkExtensions?: unknown[]; fromMarkdownExtensions?: unknown[] };

/**
 * Plugin remark delle tabelle (T-5502): il parser legge la sola sintassi delle tabelle GFM, non il resto di GFM (link
 * automatici, barrato, note, caselle), come il testo pulito del blocco (T-5501).
 */
function remarkTables(this: { data(): object }) {
  const data = this.data() as ParserData;
  (data.micromarkExtensions ??= []).push(gfmTable());
  (data.fromMarkdownExtensions ??= []).push(gfmTableFromMarkdown());
}

type ArticleMarkdownProps = {
  markdown: string;
  marks: ArticleMark[];
  projectId: string;
  /** Pagine del piano: solo i link page: verso queste diventano link. */
  pageIds: ReadonlySet<string>;
};

/**
 * Testo di un blocco dell'articolo (T-4401): Markdown senza HTML grezzo né immagini (CWE-79), con i link [testo](page:<id>)
 * verso le pagine del piano resi come link al pannello della pagina; ogni altro indirizzo resta testo. Le tabelle (T-5502)
 * sono elementi di React con intestazione e corpo, in un contenitore che scorre in orizzontale. Le corrispondenze dei
 * controlli sono evidenziate in giallo (tratti AI) e in arancio (dati da verificare), anche nelle celle.
 */
export function ArticleMarkdown({ markdown, marks, projectId, pageIds }: ArticleMarkdownProps) {
  const urlTransform = (url: string): string | undefined => {
    const pageId = /^page:(.+)$/.exec(url)?.[1];
    return pageId && pageIds.has(pageId) ? planHref(projectId, { page: pageId }) : undefined;
  };
  const components: Components = {
    a: ({ href, children }: ComponentPropsWithoutRef<"a">) =>
      href ? (
        <Link href={href} className="font-medium underline">
          {children}
        </Link>
      ) : (
        <span>{children}</span>
      ),
    table: ({ children }: ComponentPropsWithoutRef<"table">) => (
      <div className="article-table">
        <table>{children}</table>
      </div>
    ),
  };
  return (
    <div className="article-body space-y-3 text-sm leading-6">
      <Markdown
        skipHtml
        disallowedElements={["img"]}
        urlTransform={urlTransform}
        remarkPlugins={[remarkTables]}
        rehypePlugins={[[highlightMarks, { markdown, marks }]]}
        components={components}
      >
        {markdown}
      </Markdown>
    </div>
  );
}
