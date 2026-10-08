import { NextResponse } from "next/server";
import { verifyPaddleSignature } from "@/lib/billing/paddle-signature";
import { processPaddleEvent } from "@/lib/billing/webhook";
import { getIntEnv, getPaddleWebhookSecret } from "@/lib/env";
import { errorResponse, withApiErrors } from "@/lib/http/errors";
import { logger } from "@/lib/observability/logger";
import { getRequestId } from "@/lib/observability/request-id";

/**
 * Webhook di Paddle Billing (T-1603): rotta pubblica senza sessione, accetta solo richieste con firma HMAC-SHA256 valida
 * sul corpo grezzo e timestamp recente (CWE-347, CWE-294). Firma assente o non valida → 401 INVALID_SIGNATURE senza
 * scritture, log senza corpo né header. Un evento già registrato o ignorato risponde 200 per fermare i retry; un errore
 * del DB risponde 500 così Paddle ritenta.
 */
export const POST = withApiErrors(async (request: Request) => {
  // Il corpo grezzo si legge prima di qualunque parse: la firma vale sui byte ricevuti.
  const rawBody = await request.text();
  const secret = getPaddleWebhookSecret();
  const failure = secret
    ? verifyPaddleSignature({
        header: request.headers.get("paddle-signature"),
        rawBody,
        secret,
        nowMs: Date.now(),
        toleranceSeconds: getIntEnv("PADDLE_WEBHOOK_TOLERANCE_SECONDS"),
      })
    : "not_configured";
  if (failure) {
    logger.warn("billing_webhook_invalid_signature", { requestId: getRequestId(request), reason: failure });
    return errorResponse(401, "INVALID_SIGNATURE", "Firma non valida");
  }

  const result = await processPaddleEvent(rawBody);
  return NextResponse.json({ data: { result } });
});
