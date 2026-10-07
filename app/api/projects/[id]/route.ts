import { NextResponse } from "next/server";
import { type ProjectParams, withUserRoute } from "@/lib/http/user-route";
import { deleteOwnedProject, patchOwnedProject } from "@/lib/modules/project-update";

export const PATCH = withUserRoute(async (request: Request, user, { id }: ProjectParams) => {
  const payload: unknown = await request.json();

  // Aggiornamento parziale (T-809): solo i campi inviati, validati da uno schema strict.
  const updated = await patchOwnedProject(user, id, payload);
  return NextResponse.json({ data: updated });
});

export const DELETE = withUserRoute(async (request: Request, user, { id }: ProjectParams) => {
  await deleteOwnedProject(user.id, id);
  return NextResponse.json({ success: true });
});
