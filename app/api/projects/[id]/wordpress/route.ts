import { NextResponse } from "next/server";
import { type ProjectParams, withUserRoute } from "@/lib/http/user-route";
import { deleteWordPressConnection, saveWordPressConnection } from "@/lib/integrations/wordpress";

export const runtime = "nodejs";

/**
 * Collegamento del progetto a WordPress (T-4601) con { siteUrl, username, appPassword } e project.update: 200 con
 * indirizzo, utente e configured, mai la password; 400 VALIDATION_ERROR per un indirizzo, un utente o una password non
 * validi.
 */
export const PUT = withUserRoute(async (request: Request, user, { id }: ProjectParams) => {
  const data = await saveWordPressConnection(user, id, await request.json());
  return NextResponse.json({ data }, { headers: { "Cache-Control": "no-store" } });
});

/** Scollega WordPress (T-4601) con project.update: cancella indirizzo, utente e password. */
export const DELETE = withUserRoute(async (_request: Request, user, { id }: ProjectParams) => {
  await deleteWordPressConnection(user, id);
  return NextResponse.json({ success: true });
});
