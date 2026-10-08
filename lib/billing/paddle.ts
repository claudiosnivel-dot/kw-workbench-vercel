import { type BillingProvider, BillingProviderError, type PortalLinks } from "@/lib/billing/provider";
import { getPaddleSettings, type PaddleSettings } from "@/lib/env";
import { logger } from "@/lib/observability/logger";

/**
 * Paddle Billing (T-1602, D-06) con fetch nativo verso l'API di Paddle: Authorization Bearer con la API key letta
 * dall'ambiente validato, mai nei log né nel bundle client (CWE-798, CWE-532). Ogni errore diventa 502
 * BILLING_PROVIDER_ERROR, con status e request id nei log e mai il body di Paddle.
 */

const PADDLE_TIMEOUT_MS = 10_000;

type PaddleEnvelope<T> = { data?: T; meta?: { request_id?: string } };

type Operation = "create_transaction" | "portal_session" | "cancel_subscription" | "change_plan";

async function paddleRequest<T>(
  settings: PaddleSettings,
  requestId: string,
  operation: Operation,
  method: "POST" | "PATCH",
  path: string,
  body: unknown
): Promise<T> {
  let response: Response;
  try {
    response = await fetch(`${settings.apiBaseUrl}${path}`, {
      method,
      headers: { Authorization: `Bearer ${settings.apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(PADDLE_TIMEOUT_MS),
    });
  } catch (error) {
    logger.warn("billing_provider_error", {
      requestId,
      operation,
      status: null,
      errorName: error instanceof Error ? error.name : typeof error,
    });
    throw new BillingProviderError();
  }

  const envelope = (await response.json().catch(() => null)) as PaddleEnvelope<T> | null;
  if (!response.ok || envelope?.data === undefined) {
    logger.warn("billing_provider_error", {
      requestId,
      operation,
      status: response.status,
      providerRequestId: envelope?.meta?.request_id ?? null,
    });
    throw new BillingProviderError();
  }
  return envelope.data;
}

type PortalSession = {
  urls?: {
    general?: { overview?: string };
    subscriptions?: { id?: string; update_subscription_payment_method?: string; cancel_subscription?: string }[];
  };
};

export function createPaddleProvider(settings: PaddleSettings, requestId: string): BillingProvider {
  return {
    async createCheckout({ priceId, workspaceId, initiatedByUserId, customerId }) {
      // workspace_id è scritto dal server dopo il controllo di ruolo: il browser riceve solo l'id della transazione.
      const transaction = await paddleRequest<{ id?: string }>(settings, requestId, "create_transaction", "POST", "/transactions", {
        items: [{ price_id: priceId, quantity: 1 }],
        custom_data: { workspace_id: workspaceId, initiated_by_user_id: initiatedByUserId },
        ...(customerId ? { customer_id: customerId } : {}),
      });
      if (!transaction.id) {
        throw new BillingProviderError();
      }
      return { transactionId: transaction.id };
    },

    async createPortalSession({ customerId, subscriptionId }): Promise<PortalLinks> {
      const session = await paddleRequest<PortalSession>(
        settings,
        requestId,
        "portal_session",
        "POST",
        `/customers/${encodeURIComponent(customerId)}/portal-sessions`,
        { subscription_ids: [subscriptionId] }
      );
      const overview = session.urls?.general?.overview;
      if (!overview) {
        throw new BillingProviderError();
      }
      const links = session.urls?.subscriptions?.find((item) => item.id === subscriptionId);
      return {
        overview,
        updatePaymentMethod: links?.update_subscription_payment_method ?? null,
        cancel: links?.cancel_subscription ?? null,
      };
    },

    async cancelSubscription(subscriptionId) {
      await paddleRequest(settings, requestId, "cancel_subscription", "POST", `/subscriptions/${encodeURIComponent(subscriptionId)}/cancel`, {
        effective_from: "next_billing_period",
      });
    },

    async changePlan({ subscriptionId, priceId, prorationBillingMode }) {
      await paddleRequest(settings, requestId, "change_plan", "PATCH", `/subscriptions/${encodeURIComponent(subscriptionId)}`, {
        items: [{ price_id: priceId, quantity: 1 }],
        proration_billing_mode: prorationBillingMode,
      });
    },
  };
}

/** Provider della richiesta: Paddle con l'ambiente validato; senza configurazione 502 BILLING_PROVIDER_ERROR. */
export function getBillingProvider(requestId: string): BillingProvider {
  const settings = getPaddleSettings();
  if (!settings) {
    logger.warn("billing_provider_error", { requestId, operation: "configuration", status: null });
    throw new BillingProviderError();
  }
  return createPaddleProvider(settings, requestId);
}
