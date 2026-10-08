import { getTranslations } from "next-intl/server";
import { PricingTable } from "@/components/marketing/pricing-table";
import { getOptionalAuthenticatedUserFromCookies } from "@/lib/auth/current-user";
import { isCommercialLive } from "@/lib/billing/launch";
import { getPlans, isPlansConfigured } from "@/lib/billing/plans";
import { buildPricingView } from "@/lib/billing/pricing-view";
import { type LangPageProps, marketingLocale, marketingMetadataFor } from "@/lib/marketing/page";

export const dynamic = "force-dynamic";
export const generateMetadata = marketingMetadataFor("pricing");

/**
 * Prezzi pubblici su /it/pricing e /en/pricing (T-1802) dalla configurazione dei piani che applica i limiti. Con i
 * segnaposto di D-14 o con il lancio commerciale in pausa (D-32) solo l'avviso pricing.comingSoon: nessun prezzo né CTA
 * di acquisto, in qualsiasi ambiente.
 */
export default async function PricingPage(props: LangPageProps) {
  const locale = await marketingLocale(props);
  const t = await getTranslations({ locale, namespace: "pricing" });
  const available = isPlansConfigured() && (await isCommercialLive());
  const viewer = available ? await getOptionalAuthenticatedUserFromCookies() : null;

  return (
    <div className="space-y-6">
      <section className="card space-y-2">
        <h1 className="text-3xl font-semibold leading-tight">{t("title")}</h1>
        <p className="text-sm text-slate-600 sm:text-base">{t("intro")}</p>
      </section>
      {available ? (
        <PricingTable plans={buildPricingView(getPlans(), locale, viewer ? "authenticated" : "anonymous")} />
      ) : (
        <section className="card text-sm text-slate-600" data-testid="pricing-coming-soon">
          {t("comingSoon")}
        </section>
      )}
    </div>
  );
}
