import { NextRequest, NextResponse } from "next/server";
import { requireAuthenticatedUserFromRequest } from "@/lib/auth/current-user";
import { requireRequestWorkspace } from "@/lib/authz/workspace";
import { withApiErrors } from "@/lib/http/errors";
import { routeLocale } from "@/lib/i18n/route-locale";
import { parseQuickStart } from "@/lib/modules/project-settings";
import { createQuickStartProject, startQuickStartExtraction } from "@/lib/modules/quick-start";
import { resolveDefaultTargeting } from "@/lib/modules/targeting";

export const runtime = "nodejs";

/**
 * Avvio rapido (T-2301, T-3701): da un solo campo crea progetto, primo argomento e parole di partenza nel workspace attivo
 * della sessione (mai un workspaceId dal corpo, CWE-639) e avvia la ricerca. 201 con extraction started oppure il code
 * che ha impedito l'avvio, con jobId null: progetto e argomento restano creati.
 */
export const POST = withApiErrors(async (request: NextRequest) => {
  const user = await requireAuthenticatedUserFromRequest(request);
  const input = parseQuickStart(await request.json());
  const workspace = await requireRequestWorkspace(user, request, "project.create");

  const targeting = await resolveDefaultTargeting(workspace.id, routeLocale(request, user));
  const creation = await createQuickStartProject(user, workspace.id, input, targeting);
  const { jobId, extraction } = await startQuickStartExtraction(user, creation, workspace);

  return NextResponse.json({ data: { ...creation, jobId, extraction } }, { status: 201 });
});
