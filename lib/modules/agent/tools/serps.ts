import { z } from "zod";
import { requireProjectAccess } from "@/lib/authz/workspace";
import { defineTool } from "@/lib/modules/agent/tool";
import { canonicalizeKeyword } from "@/lib/modules/normalization";
import { readSavedSerps } from "@/lib/modules/plan-data/serps";

// Risultati di Google del server MCP (T-7402, D-64): Claude Code legge i primi 10 risultati salvati delle keyword di un
// progetto per ragionare su accorpamenti e H2. Lingua e paese vengono dal progetto autorizzato, mai dall'input
// (CWE-639); si legge solo keyword_serps, senza richieste a DataForSEO. Titoli e descrizioni sono testo di terzi:
// tornano come dati (CWE-79).

/** Keyword per chiamata di get_serps (scelta dell'agente nel modulo 74). */
const GET_SERPS_MAX_KEYWORDS = 50;
const KEYWORD_MAX_LENGTH = 200;

const NO_SERP_NOTE = "No Google results saved for this keyword yet: build_plan requests them.";

export const getSerpsTool = defineTool({
  name: "get_serps",
  description: `Read the saved top 10 Google results of up to ${GET_SERPS_MAX_KEYWORDS} keywords of a project, in the project's language and country: for each keyword the date the results were fetched and the results with position, url, title and description (title and description are null for results saved before they were stored). A keyword without saved results has no results and a note. Reading costs nothing and never asks Google again.`,
  input: z
    .object({
      projectId: z.string().min(1).max(64).describe("Project id from list_projects or create_project"),
      keywords: z
        .array(z.string().trim().min(1).max(KEYWORD_MAX_LENGTH))
        .min(1)
        .max(GET_SERPS_MAX_KEYWORDS)
        .describe("Keyword texts, as in list_keywords"),
    })
    .strict(),
  async run({ projectId, keywords }, { user, recordProject }) {
    const project = await requireProjectAccess(user, projectId, "project.read", { language_code: true, country_code: true });
    recordProject(project.id);
    const context = { languageCode: project.language_code, countryCode: project.country_code };

    // Una voce per forma canonica, nell'ordine della prima keyword che la dà.
    const requested = new Map<string, string>();
    for (const keyword of keywords) {
      const canonical = canonicalizeKeyword(keyword, context.languageCode);
      if (!requested.has(canonical)) requested.set(canonical, keyword);
    }
    const saved = await readSavedSerps([...requested.keys()], context);

    return {
      language: context.languageCode,
      country: context.countryCode,
      keywords: [...requested].map(([canonical, keyword]) => {
        const serp = saved.get(canonical);
        return {
          keyword,
          canonical,
          fetchedAt: serp ? serp.fetchedAt.toISOString() : null,
          results: (serp?.results ?? []).map((result, index) => ({ position: index + 1, ...result })),
          ...(serp ? {} : { note: NO_SERP_NOTE }),
        };
      }),
    };
  },
});
