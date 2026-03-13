import { BrandingSettingsCard } from "@/components/branding-settings-card";
import { GoogleAdsIntegrationCard } from "@/components/google-ads-integration-card";
import { requireAuthenticatedUserFromCookies } from "@/lib/auth/current-user";
import { getBrandingSnapshot } from "@/lib/integrations/branding";
import { getGoogleAdsCredentialSnapshot } from "@/lib/integrations/google-ads";
import { getGoogleAdsApiConfigSnapshot } from "@/lib/integrations/google-ads-config";

export const dynamic = "force-dynamic";

export default async function IntegrationsPage() {
  const user = await requireAuthenticatedUserFromCookies();

  const [snapshot, apiConfig, branding] = await Promise.all([
    getGoogleAdsCredentialSnapshot(user.id),
    getGoogleAdsApiConfigSnapshot(),
    getBrandingSnapshot(),
  ]);

  return (
    <div className="space-y-6">
      <section className="card">
        <h1 className="text-2xl font-semibold">Impostazioni</h1>
        <p className="mt-2 text-sm text-slate-600">
          Personalizza branding e integrazioni esterne. La connessione Google Ads e opzionale.
        </p>
      </section>

      <BrandingSettingsCard
        initial={{
          appName: branding.appName,
          logoUrl: branding.logoUrl,
        }}
      />

      <GoogleAdsIntegrationCard
        initial={{
          connected: snapshot.connected,
          connectedEmail: snapshot.connectedEmail,
          customerId: snapshot.customerId,
          loginCustomerId: snapshot.loginCustomerId,
          scope: snapshot.scope,
          tokenType: snapshot.tokenType,
          updatedAt: snapshot.updatedAt?.toISOString(),
        }}
        apiConfig={{
          clientId: apiConfig.clientId,
          redirectUri: apiConfig.redirectUri,
          apiVersion: apiConfig.apiVersion,
          batchSize: apiConfig.batchSize,
          hasDeveloperToken: apiConfig.hasDeveloperToken,
          hasClientSecret: apiConfig.hasClientSecret,
        }}
      />
    </div>
  );
}