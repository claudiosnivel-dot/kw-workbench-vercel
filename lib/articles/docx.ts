import {
  AlignmentType,
  Document,
  ExternalHyperlink,
  HeadingLevel,
  LevelFormat,
  Packer,
  Paragraph,
  type ParagraphChild,
  Table,
  TableCell,
  TableRow,
  TextRun,
  WidthType,
} from "docx";
import { type ArticleExport, imageLine, imagesAfter, linkHref, type MdNode, parseMarkdown, tableAlign, tableRows } from "@/lib/articles/render";

/*
 * File Word dell'articolo (T-4502, D-46): l'H1 come titolo, gli H2 e gli H3 come intestazioni, grassetti, corsivi ed
 * elenchi dal Markdown dei blocchi, i link interni risolti come nell'HTML (T-4501), le tabelle come tabelle di Word
 * (T-5602) e i segnaposto immagine come paragrafi in corsivo; niente dati strutturati, che servono solo alla pagina web.
 */

const NUMBERED = "article-numbered";
const HEADINGS = [HeadingLevel.HEADING_3, HeadingLevel.HEADING_4, HeadingLevel.HEADING_5, HeadingLevel.HEADING_6] as const;

const CELL_ALIGNMENT = { left: AlignmentType.LEFT, center: AlignmentType.CENTER, right: AlignmentType.RIGHT } as const;

type RunStyle = { bold?: boolean; italics?: boolean };
type DocxContext = { article: ArticleExport; numberedLists: number };

/** Testi e link di un nodo in linea, con grassetto e corsivo ereditati. */
function runs(node: MdNode, context: DocxContext, style: RunStyle = {}): ParagraphChild[] {
  const children = (next: RunStyle = style) => (node.children ?? []).flatMap((child) => runs(child, context, next));
  switch (node.type) {
    case "text":
    case "inlineCode":
    case "html":
      return [new TextRun({ text: node.value ?? "", ...style })];
    case "break":
      return [new TextRun({ text: "", break: 1 })];
    case "strong":
      return children({ ...style, bold: true });
    case "emphasis":
      return children({ ...style, italics: true });
    case "link": {
      const href = linkHref(node.url ?? "", context.article);
      if (!href) return children();
      const text = (node.children ?? []).flatMap((child) => runs(child, context, style));
      return [new ExternalHyperlink({ link: href, children: text.length > 0 ? text : [new TextRun({ text: href, ...style })] })];
    }
    default:
      return children();
  }
}

/**
 * Tabella di Word a tutta larghezza (T-5602): la riga d'intestazione si ripete in cima a ogni pagina e ha il testo in
 * grassetto; ogni cella è un paragrafo con l'allineamento della sua colonna.
 */
function table(node: MdNode, context: DocxContext): Table {
  const row = (cells: MdNode[], header: boolean) =>
    new TableRow({
      tableHeader: header,
      children: cells.map((cell, index) => {
        const align = tableAlign(node, index);
        const paragraph = new Paragraph({ alignment: align ? CELL_ALIGNMENT[align] : undefined, children: runs(cell, context, header ? { bold: true } : {}) });
        return new TableCell({ children: [paragraph] });
      }),
    });
  const [header = [], ...rows] = tableRows(node);
  return new Table({ width: { size: 100, type: WidthType.PERCENTAGE }, rows: [row(header, true), ...rows.map((cells) => row(cells, false))] });
}

/** Paragrafi e tabelle di un nodo di blocco; gli elenchi numerati ripartono da 1 a ogni elenco. */
function blocks(node: MdNode, context: DocxContext, level = 0): (Paragraph | Table)[] {
  const children = node.children ?? [];
  switch (node.type) {
    case "paragraph":
      return [new Paragraph({ children: runs(node, context) })];
    case "heading":
      return [new Paragraph({ heading: HEADINGS[Math.min(3, Math.max(0, (node.depth ?? 3) - 3))], children: runs(node, context) })];
    case "list": {
      const instance = node.ordered ? ++context.numberedLists : 0;
      return children.flatMap((item) =>
        (item.children ?? []).flatMap((child) => {
          if (child.type !== "paragraph") return blocks(child, context, level + 1);
          const marker = node.ordered ? { numbering: { reference: NUMBERED, level, instance } } : { bullet: { level } };
          return [new Paragraph({ ...marker, children: runs(child, context) })];
        })
      );
    }
    case "blockquote":
      return children.flatMap((child) => blocks(child, context, level));
    case "table":
      return [table(node, context)];
    case "html":
    case "code":
      return [new Paragraph({ children: [new TextRun(node.value ?? "")] })];
    default:
      return [];
  }
}

/** Documento Word dell'articolo come Buffer (Packer di docx). */
export async function renderArticleDocx(article: ArticleExport): Promise<Buffer> {
  const context: DocxContext = { article, numberedLists: 0 };
  const paragraphs: (Paragraph | Table)[] = [new Paragraph({ text: article.h1, heading: HeadingLevel.TITLE })];
  for (const section of article.sections) {
    if (section.kind !== "INTRO" && section.heading) paragraphs.push(new Paragraph({ text: section.heading, heading: HeadingLevel.HEADING_2 }));
    if (section.body.trim()) paragraphs.push(...(parseMarkdown(section.body).children ?? []).flatMap((node) => blocks(node, context)));
    for (const item of imagesAfter(article, section.position)) {
      paragraphs.push(new Paragraph({ children: [new TextRun({ text: imageLine(article, item), italics: true })] }));
    }
  }
  const document = new Document({
    numbering: {
      config: [
        {
          reference: NUMBERED,
          levels: [0, 1, 2].map((level) => ({
            level,
            format: LevelFormat.DECIMAL,
            text: `%${level + 1}.`,
            alignment: AlignmentType.START,
            style: { paragraph: { indent: { left: 720 * (level + 1), hanging: 360 } } },
          })),
        },
      ],
    },
    sections: [{ children: paragraphs }],
  });
  return Packer.toBuffer(document);
}
