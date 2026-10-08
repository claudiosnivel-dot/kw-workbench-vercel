import type { ProrationBillingMode } from "@/lib/billing/plans";
import { AppError } from "@/lib/http/errors";

/**
 * Interfaccia del Merchant of Record (T-1602, D-06): tipi neutri, così il provider (Paddle Billing; alternativa Lemon
 * Squeezy) si sostituisce senza toccare rotte e pagine.
 */

export type CheckoutRequest = {
  priceId: string;
  workspaceId: string;
  initiatedByUserId: string;
  /** Cliente già noto del workspace (abbonamento precedente), altrimenti null. */
  customerId: string | null;
};

/** Link temporanei del portale cliente: mai salvati né loggati (T-1604, CWE-524). */
export type PortalLinks = {
  overview: string;
  updatePaymentMethod: string | null;
  cancel: string | null;
};

export interface BillingProvider {
  createCheckout(input: CheckoutRequest): Promise<{ transactionId: string }>;
  createPortalSession(input: { customerId: string; subscriptionId: string }): Promise<PortalLinks>;
  cancelSubscription(subscriptionId: string): Promise<void>;
  changePlan(input: { subscriptionId: string; priceId: string; prorationBillingMode: ProrationBillingMode }): Promise<void>;
}

/** Errore del provider (rete, 4xx, 5xx o configurazione mancante): 502 senza il body del provider (CWE-209). */
export class BillingProviderError extends AppError {
  constructor() {
    super(502, "BILLING_PROVIDER_ERROR", "Il servizio di pagamento non ha risposto correttamente");
    this.name = "BillingProviderError";
  }
}
