import { NextResponse } from "next/server";
import { requireProjectAccess } from "@/lib/authz/workspace";
import { type BrandParams, withUserRoute } from "@/lib/http/user-route";
import { removeProjectBrand } from "@/lib/modules/project-brands";

/** Toglie un marchio del progetto (T-2601): le keyword trovate da quel marchio tornano allowed. */
export const DELETE = withUserRoute(async (request: Request, user, { id, brandId }: BrandParams) => {
  const project = await requireProjectAccess(user, id, "project.update", {});
  await removeProjectBrand(project, brandId);
  return NextResponse.json({ success: true });
});
