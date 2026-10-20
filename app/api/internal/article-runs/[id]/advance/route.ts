import { NextResponse } from "next/server";
import { acceptArticleRunStep } from "@/lib/articles/run";
import { withApiErrors } from "@/lib/http/errors";

export const runtime = "nodejs";
export const maxDuration = 300;

/**
 * Passo di un lavoro di articolo (T-4101): fuori dal controllo di sessione del proxy, protetta dalla firma HMAC di
 * «article-run:» più l'id e della scadenza; 401 con una firma non valida, anche quella di un job delle ricerche con lo
 * stesso id. Altrimenti 202 subito e il passo in after(), entro la maxDuration della rotta.
 */
export const POST = withApiErrors(async (request: Request, context: { params: Promise<{ id: string }> }) => {
  const runId = (await context.params).id;
  acceptArticleRunStep(runId, request.headers);
  return NextResponse.json({ data: { runId } }, { status: 202 });
});
