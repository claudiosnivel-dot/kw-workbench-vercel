import { getFormatter, getTranslations } from "next-intl/server";
import { BillingPortalButton, CancelSubscriptionButton, ChangePlanForm } from "@/components/billing-actions";
import { CheckoutButton } from "@/components/checkout-button";
import { UsageSummary } from "@/components/usage-summary";
import { canPerform } from "@/lib/authz/permissions";
import { getEntitlements } from "@/lib/billing/entitlements";
import { isCommercialLive } from "@/lib/billing/launch";
import { FREE_PLAN_ID, getPlan } from "@/lib/billing/plans";
import { getBillingSummary, listPurchasableOptions } from "@/lib/billing/summary";
import { getUsageSummary } from "@/lib/billing/usage";
import { getPaddleClientToken, getPaddleSettings } from "@/lib/env";
import { formatDate } from "@/lib/view/format";
import { requireCurrentWorkspace } from "@/lib/workspaces/current";

export const dynamic = "force-dynamic";

/** Stati in cui l'OWNER cambia piano o disdice; con canceled o senza abbonamento compare il checkout. */
const MANAGEABLE = new Set(["trialing", "active", "past_due"]);

/**
 * Sezione Piano del workspace (T-3102, T-1604): «Il tuo piano» (piano, stato, rinnovo o disdetta programmata) e «Uso del
 * mese» per tutti i membri; «Gestisci» con checkout, portale, cambio piano e disdetta solo per l'OWNER (billing.manage),
 * riverificati dalle rotte. Con il lancio commerciale in pausa (D-32) la sezione lo dice e non mostra azioni.
 */
export default async function WorkspacePlanPage() {
  const { workspace } = await requireCurrentWorkspace();
  const [t, tAll, format, live, summary] = await Promise.all([
    getTranslations("billing"),
    getTranslations(),
    getFormatter(),
    isCommercialLive(),
    getBillingSummary(workspace.id),
  ]);

  if (!live) {
    return <section className="card text-sm text-slate-600">{t("paused")}</section>;
  }

  // Nome del piano dal catalogo (nameKey di lib/billing/plans.ts); senza voce nel catalogo, l'id del piano.
  // Uso del workspace con i limiti del piano (T-1703): solo con il lancio attivo, quando le quote si applicano.
  const { limits } = await getEntitlements(workspace.id);
  const usage = await getUsageSummary(workspace.id, { runsPerDay: limits.runsPerDay, keywordsPerMonth: limits.keywordsPerMonth });
  const planName = (planId: string) => {
    const key = getPlan(planId)?.nameKey as Parameters<typeof tAll>[0] | undefined;
    return key && tAll.has(key) ? tAll(key) : planId;
  };
  const isOwner = canPerform(workspace.role, "billing.manage");
  const options = listPurchasableOptions().map((option) => ({
    ...option,
    values: { plan: planName(option.planId), interval: t(`intervals.${option.interval}`) },
  }));
  const paddle = getPaddleSettings();
  const clientToken = getPaddleClientToken();
  const manageable = summary !== null && MANAGEABLE.has(summary.status);
  const canCheckout = summary === null || summary.status === "canceled";

  return (
    <>
      <section className="card space-y-2 text-sm" data-testid="billing-summary">
        <h2 className="text-lg font-semibold">{t("summaryTitle")}</h2>
        <p className="font-medium">{t("plan", { plan: planName(summary?.planId ?? FREE_PLAN_ID) })}</p>
        <p>{t("status", { status: t(`statuses.${summary?.status ?? "none"}`) })}</p>
        {summary?.cancelAt ? (
          <p data-testid="billing-cancel-at">{t("cancelAt", { date: formatDate(summary.cancelAt, format) })}</p>
        ) : (
          manageable &&
          summary.currentPeriodEnd && <p>{t("renewal", { date: formatDate(summary.currentPeriodEnd, format) })}</p>
        )}
        {!isOwner && <p className="text-slate-600">{t("ownerOnly")}</p>}
      </section>

      <UsageSummary usage={usage} />

      {isOwner && (
        <section className="card space-y-4">
          <h2 className="text-lg font-semibold">{t("manageTitle")}</h2>
          {summary && <BillingPortalButton workspaceId={workspace.id} />}
          {manageable && (
            <>
              <h3 className="font-semibold">{t("changePlanTitle")}</h3>
              <ChangePlanForm
                workspaceId={workspace.id}
                options={options
                  .filter((option) => option.planId !== summary.planId || option.interval !== summary.billingInterval)
                  .map((option) => ({ value: `${option.planId}:${option.interval}`, label: t("planOption", option.values) }))}
              />
              {!summary.cancelAt && <CancelSubscriptionButton workspaceId={workspace.id} />}
            </>
          )}
          {canCheckout && (
            <>
              <h3 className="font-semibold">{t("checkoutTitle")}</h3>
              {options.length === 0 || !paddle || !clientToken ? (
                <p className="text-sm text-slate-600">{t("noPaidPlans")}</p>
              ) : (
                options.map((option) => (
                  <CheckoutButton
                    key={`${option.planId}:${option.interval}`}
                    workspaceId={workspace.id}
                    planId={option.planId}
                    interval={option.interval}
                    label={t("subscribe", option.values)}
                    clientToken={clientToken}
                    environment={paddle.environment}
                  />
                ))
              )}
            </>
          )}
        </section>
      )}
    </>
  );
}
