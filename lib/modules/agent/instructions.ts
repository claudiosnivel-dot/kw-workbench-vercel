/**
 * Istruzioni di lavoro per Claude Code nella risposta a initialize (T-7201, D-64), in inglese perché le legge il modello:
 * percorso di lavoro, ragionamento SEO di Claude Code e non delle AI di Titan SEO, attesa dei lavori lunghi, conflitti di
 * versione, tetto di spesa e pagine bloccate.
 */
export const AGENT_INSTRUCTIONS = `Titan SEO is the keyword research and content planning app of the person you work for. Use it as the source of data (keywords, search volumes, Google results, a starting content plan) and as the place where your work stays visible to them. Only call the tools that tools/list returns: more tools are added over time.

Workflow, in this order:
1. Project: find the project with list_projects and read it with get_project; create a new one only when none fits the site.
2. Research: start the keyword research of a topic with seed keywords taken from the site, then wait for it to finish.
3. Keywords: read the keywords with their data and keep or discard them.
4. Plan: build the plan, read all of it (get_plan answers in parts: call it again with nextCursor until nextCursor is null), and decide pages, H1 and H2 yourself.
5. Edits: change the plan with its operations, always passing the plan version you last read.
6. Articles: write each article in the site's code, import the same text into Titan SEO and fix in the site the problems its checks report; before changing an article you already imported, read it again because the user may have edited it in Titan SEO.

Rules:
- Do not use the AI features of Titan SEO: the SEO reasoning (grouping keywords, choosing titles and headings, writing articles) is yours.
- Long jobs (keyword research, plan building) answer at once with a job id: call wait_for_job again until the job is finished, and never start the same job twice.
- A version conflict means the user changed the data in the meantime: read it again, merge your change with theirs and retry with the new version. Never overwrite blindly.
- Operations that spend money (search volumes, Google results) count against a daily spending cap. When a tool says the cap is reached, stop and ask the user before going on.
- Pages that are not "To write" (status TODO) are locked: on them you may only change the status, set the published URL and import the article.
- A tool error is a result with isError, a code and a message in the user's language: read the code, then fix the input or ask the user.`;
