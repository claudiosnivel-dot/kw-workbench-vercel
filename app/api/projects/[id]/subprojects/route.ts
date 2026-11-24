import { NextResponse } from "next/server";
import { requireProjectAccess } from "@/lib/authz/workspace";
import { assertLicensedMetricsChoice } from "@/lib/billing/enforce";
import { type ProjectParams, withUserRoute } from "@/lib/http/user-route";
import { parseSubprojectCreate } from "@/lib/modules/project-settings";
import { createSection } from "@/lib/modules/sections";

export const POST = withUserRoute(async (request: Request, user, { id }: ProjectParams) => {
  const project = await requireProjectAccess(user, id, "section.write", { default_subproject_id: true });

  const parsed = parseSubprojectCreate(await request.json(), user);
  await assertLicensedMetricsChoice(user, project.workspace_id, parsed.data.metrics_provider_override, null);
  // Limiti del piano (T-1605), posizione in fondo e sezione predefinita nella transazione della creazione (T-8301).
  const subproject = await createSection(project, parsed.data, parsed.seeds);

  return NextResponse.json({ data: subproject }, { status: 201 });
});
