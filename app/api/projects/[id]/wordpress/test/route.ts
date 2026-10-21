import { NextResponse } from "next/server";
import { type ProjectParams, withUserRoute } from "@/lib/http/user-route";
import { testWordPressConnection } from "@/lib/integrations/wordpress";

export const runtime = "nodejs";

/**
 * «Prova collegamento» (T-4601) con project.update: 200 { data: { name, canEditPosts } }; 409 WP_NOT_CONFIGURED, 502
 * WP_AUTH_FAILED, WP_NOT_FOUND o WP_UNREACHABLE.
 */
export const POST = withUserRoute(async (_request: Request, user, { id }: ProjectParams) => {
  const data = await testWordPressConnection(user, id);
  return NextResponse.json({ data }, { headers: { "Cache-Control": "no-store" } });
});
