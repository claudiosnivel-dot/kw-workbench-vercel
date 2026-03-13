import { GoogleAdsIntegrationCard } from "@/components/google-ads-integration-card";
import { requireAuthenticatedUserFromCookies } from "@/lib/auth/current-user";
import { getGoogleAdsCredentialSnapshot } from "@/lib/integrations/google-ads";
import { getGoogleAdsApiConfigSnapshot } from "@/lib/integrations/google-ads-config";

export const dynamic = "force-dynamic";

export default async function IntegrationsPage() {
  const user = await requireAuthenticatedUserFromCookies();

  const [snapshot, apiConfig] = await Promise.all([
    getGoogleAdsCredentialSnapshot(user.id),
    getGoogleAdsApiConfigSnapshot(),
  ]);

  return (
    <div className="space-y-6">
      <section className="card">
        <h1 className="text-2xl font-semibold">Integrazioni</h1>
        <p className="mt-2 text-sm text-slate-600">
          Gestisci i provider esterni usati da Seo God Mode. La connessione Google Ads e opzionale.
        </p>
      </section>

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
