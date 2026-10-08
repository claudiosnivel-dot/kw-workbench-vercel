"use client";

import { useTranslations } from "next-intl";
import { useState } from "react";
import { BillingActionButton } from "@/components/billing-actions";
import { messageOf, readApiResponse, sendJson } from "@/lib/client/http";

// Paddle.js v2 si carica solo dal CDN di Paddle (developer.paddle.com/paddlejs/include-paddlejs). Lo script nasce da
// questo bundle, già ammesso dal nonce: con strict-dynamic la CSP di T-505 lo accetta senza voci di host.
const PADDLE_JS_URL = "https://cdn.paddle.com/paddle/v2/paddle.js";

type PaddleJs = {
  Environment: { set(environment: "sandbox"): void };
  Initialize(options: { token: string }): void;
  Checkout: { open(options: { transactionId: string }): void };
};

declare global {
  interface Window {
    Paddle?: PaddleJs;
  }
}

/** Paddle.js non caricato o senza l'oggetto Paddle: all'utente l'errore del provider del catalogo. */
class PaddleLoadError extends Error {}

let paddleReady: Promise<PaddleJs> | null = null;

/** Carica e inizializza Paddle.js una volta per pagina; sandbox solo con PADDLE_ENV=sandbox. */
function loadPaddle(clientToken: string, environment: "sandbox" | "production"): Promise<PaddleJs> {
  paddleReady ??= new Promise<PaddleJs>((resolve, reject) => {
    const script = document.createElement("script");
    script.src = PADDLE_JS_URL;
    script.async = true;
    script.onload = () => {
      const paddle = window.Paddle;
      if (!paddle) {
        reject(new PaddleLoadError());
        return;
      }
      if (environment === "sandbox") {
        paddle.Environment.set("sandbox");
      }
      paddle.Initialize({ token: clientToken });
      resolve(paddle);
    };
    script.onerror = () => reject(new PaddleLoadError());
    document.head.appendChild(script);
  }).catch((error: unknown) => {
    paddleReady = null;
    throw error;
  });
  return paddleReady;
}

/**
 * Checkout di un piano (T-1602): la transazione la crea il server con il workspace nei custom_data dopo il controllo di
 * ruolo; il browser riceve solo transactionId e apre l'overlay di Paddle con quello (CWE-345).
 */
export function CheckoutButton({
  workspaceId,
  planId,
  interval,
  label,
  clientToken,
  environment,
}: {
  workspaceId: string;
  planId: string;
  interval: "month" | "year";
  label: string;
  clientToken: string;
  environment: "sandbox" | "production";
}) {
  const t = useTranslations("billing");
  const tErrors = useTranslations("errors");
  const tCommon = useTranslations("common");
  const [opening, setOpening] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const open = async () => {
    setOpening(true);
    setError(null);
    try {
      const response = await sendJson("POST", "/api/billing/checkout", { workspaceId, planId, interval });
      const payload = await readApiResponse<{ data: { transactionId: string } }>(response, tErrors);
      const paddle = await loadPaddle(clientToken, environment);
      paddle.Checkout.open({ transactionId: payload?.data.transactionId ?? "" });
    } catch (checkoutError) {
      setError(
        checkoutError instanceof PaddleLoadError
          ? tErrors("BILLING_PROVIDER_ERROR")
          : messageOf(checkoutError, tCommon("unexpectedError"))
      );
    } finally {
      setOpening(false);
    }
  };

  return <BillingActionButton label={label} busyLabel={t("opening")} busy={opening} onClick={open} error={error} primary />;
}
