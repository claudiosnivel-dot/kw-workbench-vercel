import { redirect } from "next/navigation";
import { AdminUsersDashboard } from "@/components/admin-users-dashboard";
import { BrandingSettingsCard } from "@/components/branding-settings-card";
import { GoogleAdsIntegrationCard } from "@/components/google-ads-integration-card";
import { GoogleSheetsApiConfigCard } from "@/components/google-sheets-api-config-card";
import { MetricsSpendCard } from "@/components/metrics-spend-card";
import { isAdminUser } from "@/lib/auth/current-user";
import { requirePageUser } from "@/lib/auth/page-guard";
import { getBrandingSnapshot } from "@/lib/integrations/branding";
import { getGoogleAdsCredentialSnapshot } from "@/lib/integrations/google-ads";
import { getGoogleAdsApiConfigSnapshot } from "@/lib/integrations/google-ads-config";
import { getGoogleSheetsApiConfigSnapshot } from "@/lib/integrations/google-sheets-config";
import { getMetricsSpend } from "@/lib/modules/providers/metrics/metrics-ledger";

export const dynamic = "force-dynamic";

export default async function AdminPage() {
  const user = await requirePageUser();

  if (!isAdminUser(user)) {
    redirect("/");
  }

  const [branding, keywordPlannerData, googleSheetsConfig, metricsSpend] = await Promise.all([
    getBrandingSnapshot(),
    user.isRootAdmin
      ? Promise.all([getGoogleAdsCredentialSnapshot(), getGoogleAdsApiConfigSnapshot()])
      : Promise.resolve(null),
    user.isRootAdmin ? getGoogleSheetsApiConfigSnapshot() : Promise.resolve(null),
    user.isRootAdmin ? getMetricsSpend() : Promise.resolve(null),
  ]);

  return (
    <div className="space-y-6">
      <section className="card">
        <h1 className="text-2xl font-semibold">Dashboard Admin</h1>
        <p className="mt-2 text-sm text-slate-600">
          Qui trovi amministrazione utenti e impostazioni piattaforma. I dati progetto degli utenti restano sempre privati.
        </p>
      </section>

      <BrandingSettingsCard
        initial={{
          appName: branding.appName,
          logoUrl: branding.logoUrl,
          logoUrlDark: branding.logoUrlDark,
          logoUrlLight: branding.logoUrlLight,
        }}
        canEdit={user.isRootAdmin}
      />

      {user.isRootAdmin && googleSheetsConfig && <GoogleSheetsApiConfigCard initial={googleSheetsConfig} />}

      {user.isRootAdmin && metricsSpend && <MetricsSpendCard spend={metricsSpend} />}

      {user.isRootAdmin && keywordPlannerData && (
        <GoogleAdsIntegrationCard
          initial={{
            connected: keywordPlannerData[0].connected,
            connectedEmail: keywordPlannerData[0].connectedEmail,
            customerId: keywordPlannerData[0].customerId,
            loginCustomerId: keywordPlannerData[0].loginCustomerId,
            scope: keywordPlannerData[0].scope,
            tokenType: keywordPlannerData[0].tokenType,
            updatedAt: keywordPlannerData[0].updatedAt?.toISOString(),
          }}
          apiConfig={{
            clientId: keywordPlannerData[1].clientId,
            redirectUri: keywordPlannerData[1].redirectUri,
            apiVersion: keywordPlannerData[1].apiVersion,
            batchSize: keywordPlannerData[1].batchSize,
            hasDeveloperToken: keywordPlannerData[1].hasDeveloperToken,
            hasClientSecret: keywordPlannerData[1].hasClientSecret,
          }}
        />
      )}

      {!user.isRootAdmin && (
        <section className="card">
          <h2 className="text-lg font-semibold">Google Keyword Planner</h2>
          <p className="mt-2 text-sm text-slate-600">Configurazione riservata al root admin.</p>
        </section>
      )}

      <AdminUsersDashboard
        viewer={{
          id: user.id,
          username: user.username,
          isRootAdmin: user.isRootAdmin,
        }}
      />
    </div>
  );
}