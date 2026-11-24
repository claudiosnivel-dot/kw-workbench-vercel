import { z } from "zod";
import { IMPORT_ARTICLE_FIELDS, importAgentArticle, readAgentArticle } from "@/lib/articles/import";
import { requireProjectAccess } from "@/lib/authz/workspace";
import { defineTool } from "@/lib/modules/agent/tool";

// Strumenti degli articoli del server MCP (T-7601, D-64): Claude Code scrive l'articolo nel codice del sito e importa lo
// stesso testo in Titan SEO, che lo ripulisce, lo divide nei blocchi dell'editor e gli fa i controlli di oggi senza le
// sue AI; la version dell'articolo, sempre obbligatoria (0 alla prima importazione, T-8202), non lascia sovrascrivere
// le modifiche fatte nell'editor. Permessi dell'app: strategy.write per importare, project.read per leggere.

const idField = (description: string) => z.string().min(1).max(64).describe(description);
const projectIdField = idField("Project id from list_projects or create_project");
const pageIdField = idField("Page id from get_plan");

/** Risposta comune a get_article e import_article. */
const ARTICLE_ANSWER =
  "The article: articleId, version (pass it to the next import_article), source (AGENT when you imported it, TITAN_AI when the AI of Titan SEO wrote it), status, length, meta title, meta description, slug, the blocks in order (kind INTRO, H2 or FAQ, heading and Markdown text) and the saved checks: keyword density per 100 words, the article problems (main keyword missing from the H1, the opening, the meta title or the meta description, meta too long, density too high) and, for each block with something to fix, its problems and style matches (ai_pattern: AI writing tells to rewrite; to_verify: laws, amounts, percentages, years and numbers to double-check) with the matched text.";

export const importArticleTool = defineTool({
  name: "import_article",
  description: `Save in Titan SEO the article you wrote in the site for a page of the current plan, so that the user sees the same text there. The H1 is the page H1 of the plan: set H1 and H2 with update_page before importing, because importing moves a To write page to Writing and then they are locked. Markdown: the text before the first "## " heading is the introduction, each "## " heading starts a section, and a section titled with the FAQ heading of the plan language ("Domande frequenti" for Italian, "Preguntas frecuentes" for Spanish, "Frequently asked questions" for the others) is the FAQ block, with each question as a bold paragraph (**Question?**) followed by its answer. Titan SEO keeps plain Markdown (paragraphs, bold, italic, lists, ### subheadings, simple tables and links [text](page:<pageId>) to the pillar or sibling pages of the plan): HTML, images, code, # headings and other links lose everything but their text. Always pass the article version: 0 when the page has no article yet (get_article answers ARTICLE_NOT_FOUND), otherwise the version from get_article (or from your last import). A different one is ARTICLE_VERSION_CONFLICT with currentVersion because the user changed it in Titan SEO (or another import created it), so read it with get_article, merge their changes into the site and retry; JOB_ALREADY_ACTIVE means the AI of Titan SEO is writing it. No AI of Titan SEO and no spending. Answers with ${ARTICLE_ANSWER} Fix the problems you agree with in the site and import again.`,
  input: z
    .object({
      projectId: projectIdField,
      pageId: pageIdField,
      markdown: IMPORT_ARTICLE_FIELDS.markdown.describe("The article body in Markdown, up to 200000 characters and 40 blocks"),
      metaTitle: IMPORT_ARTICLE_FIELDS.metaTitle.describe("Meta title, up to 60 characters"),
      metaDescription: IMPORT_ARTICLE_FIELDS.metaDescription.describe("Meta description, up to 155 characters"),
      slug: IMPORT_ARTICLE_FIELDS.slug.describe("URL slug: lowercase letters and digits separated by hyphens, up to 80 characters"),
      version: IMPORT_ARTICLE_FIELDS.version.describe("Article version from your last get_article or import_article; 0 when the page has no article yet"),
    })
    .strict(),
  async run({ projectId, ...input }, { user, recordProject }) {
    const project = await requireProjectAccess(user, projectId, "strategy.write", {});
    recordProject(project.id);
    await importAgentArticle(user, project, input);
    return readAgentArticle(project, input.pageId);
  },
});

export const getArticleTool = defineTool({
  name: "get_article",
  description: `Read the article of a page as it is now in Titan SEO, with the changes the user made in its editor: ${ARTICLE_ANSWER} ARTICLE_NOT_FOUND when the page has no article yet.`,
  input: z.object({ projectId: projectIdField, pageId: pageIdField }).strict(),
  async run({ projectId, pageId }, { user, recordProject }) {
    const project = await requireProjectAccess(user, projectId, "project.read", {});
    recordProject(project.id);
    return readAgentArticle(project, pageId);
  },
});
