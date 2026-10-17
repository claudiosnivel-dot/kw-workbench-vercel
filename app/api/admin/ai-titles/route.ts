import { NextResponse } from "next/server";
import { getAiTitlesView, updateAiTitlesSettings } from "@/lib/ai/settings";
import { requireRootAdminUserFromRequest } from "@/lib/auth/current-user";
import { withApiErrors } from "@/lib/http/errors";
import { getClientIp } from "@/lib/security/client-ip";

const NO_STORE = { "Cache-Control": "no-store" };

/**
 * Impostazioni dei titoli con l'AI (T-3501): solo il root admin (admin non root e abbonati 403, anonimi 401). La chiave
 * di OpenRouter esce solo come keyConfigured; used24h sono le proposte delle ultime 24 ore. Risposte no-store.
 */
export const GET = withApiErrors(async (request: Request) => {
  await requireRootAdminUserFromRequest(request);
  return NextResponse.json({ data: await getAiTitlesView() }, { headers: NO_STORE });
});

/** Salva interruttore, modello gratuito e limiti (T-3501): modello non gratuito → 400 AI_MODEL_NOT_FREE. */
export const PATCH = withApiErrors(async (request: Request) => {
  const actor = await requireRootAdminUserFromRequest(request);
  const data = await updateAiTitlesSettings(actor, await request.json(), getClientIp(request));
  return NextResponse.json({ data }, { headers: NO_STORE });
});
