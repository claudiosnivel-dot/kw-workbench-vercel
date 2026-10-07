import { NextResponse } from "next/server";
import { requireAuthenticatedUserFromRequest } from "@/lib/auth/current-user";
import { errorResponse, withApiErrors } from "@/lib/http/errors";
import { LEGAL_TERMS_VERSION } from "@/lib/legal/version";
import { prisma } from "@/lib/prisma";

/**
 * Accettazione dei termini correnti (T-1405), solo con sessione: la versione inviata deve essere quella del server
 * (altrimenti 409 TERMS_VERSION_CHANGED) e si salva sempre la costante del server con l'istante (CWE-602).
 */
export const POST = withApiErrors(async (request: Request) => {
  const user = await requireAuthenticatedUserFromRequest(request);
  const body = (await request.json()) as { termsVersion?: unknown } | null;

  if (body?.termsVersion !== LEGAL_TERMS_VERSION) {
    return errorResponse(409, "TERMS_VERSION_CHANGED", "La versione dei termini è cambiata");
  }

  await prisma.user.update({
    where: { id: user.id },
    data: { accepted_terms_version: LEGAL_TERMS_VERSION, accepted_terms_at: new Date() },
    select: { id: true },
  });
  return NextResponse.json({ success: true });
});
