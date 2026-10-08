import { getFormatter, getTranslations } from "next-intl/server";
import { BillingPortalButton, CancelSubscriptionButton, ChangePlanForm } from "@/components/billing-actions";
import { CheckoutButton } from "@/components/checkout-button";
import { PageIntro } from "@/components/page-intro";
import { UsageSummary } from "@/components/usage-summary";
import { requirePageUser } from "@/lib/auth/page-guard";
import { canPerform } from "@/lib/authz/permissions";
import { getPageWorkspace } from "@/lib/authz/workspace";
import { getEntitlements } from "@/lib/billing/entitlements";
import { isCommercialLive } from "@/lib/billing/launch";
import { FREE_PLAN_ID, getPlan } from "@/lib/billing/plans";
import { getBillingSummary, listPurchasableOptions } from "@/lib/billing/summary";
import { getUsageSummary } from "@/lib/billing/usage";
import { getPaddleClientToken, getPaddleSettings } from "@/lib/env";
import { formatDate } from "@/lib/view/format";

export const dynamic = "force-dynamic";

/** Stati in cui l'OWNER cambia piano o disdice; con canceled o senza abbonamento compare il checkout. */
const MANAGEABLE = new Set(["trialing", "active", "past_due"]);

/**
 * Fatturazione del workspace attivo (T-1604): piano, stato, rinnovo e disdetta programmata per tutti i membri; checkout,
 * portale, cambio piano e disdetta solo per l'OWNER (billing.manage), riverificati dalle rotte. Con il lancio commerciale
 * in pausa (D-32) la pagina lo dice e non mostra azioni.
 */
export default async function BillingPage() {
  const user = await requirePageUser();
  const { workspace } = await getPageWorkspace(user.id);
  const [t, tAll, format, live, summary] = await Promise.all([
    getTranslations("billing"),
    getTranslations(),
    getFormatter(),
    isCommercialLive(),
    getBillingSummary(workspace.id),
  ]);
  const intro = <PageIntro title={t("title")} intro={t("intro", { name: workspace.name })} />;

  if (!live) {
    return (
      <div className="space-y-6">
        {intro}
        <section className="card text-sm text-slate-600">{t("paused")}</section>
      </div>
    );
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
    <div className="space-y-6">
      {intro}

      <section className="card space-y-2 text-sm" data-testid="billing-summary">
        <p className="font-medium">{t("plan", { plan: planName(summary?.planId ?? FREE_PLAN_ID) })}</p>
        <p>{t("status", { status: t(`statuses.${summary?.status ?? "none"}`) })}</p>
        {summary?.cancelAt ? (
          <p data-testid="billing-cancel-at">{t("cancelAt", { date: formatDate(summary.cancelAt, format) })}</p>
        ) : (
          manageable &&
          summary.currentPeriodEnd && <p>{t("renewal", { date: formatDate(summary.currentPeriodEnd, format) })}</p>
        )}
      </section>

      <UsageSummary usage={usage} />

      {!isOwner ? (
        <p className="text-sm text-slate-600">{t("ownerOnly")}</p>
      ) : (
        <section className="card space-y-4">
          {summary && <BillingPortalButton workspaceId={workspace.id} />}
          {manageable && (
            <>
              <h2 className="text-lg font-semibold">{t("changePlanTitle")}</h2>
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
              <h2 className="text-lg font-semibold">{t("checkoutTitle")}</h2>
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
    </div>
  );
}
