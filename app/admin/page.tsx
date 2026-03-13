import { redirect } from "next/navigation";
import { AdminUsersDashboard } from "@/components/admin-users-dashboard";
import { GoogleAdsIntegrationCard } from "@/components/google-ads-integration-card";
import { isAdminUser, requireAuthenticatedUserFromCookies } from "@/lib/auth/current-user";
import { getGoogleAdsCredentialSnapshot } from "@/lib/integrations/google-ads";
import { getGoogleAdsApiConfigSnapshot } from "@/lib/integrations/google-ads-config";

export const dynamic = "force-dynamic";

export default async function AdminPage() {
  const user = await requireAuthenticatedUserFromCookies();

  if (!isAdminUser(user)) {
    redirect("/");
  }

  const keywordPlannerData = user.isRootAdmin
    ? await Promise.all([getGoogleAdsCredentialSnapshot(), getGoogleAdsApiConfigSnapshot()])
    : null;

  return (
    <div className="space-y-6">
      <section className="card">
        <h1 className="text-2xl font-semibold">Dashboard Admin</h1>
        <p className="mt-2 text-sm text-slate-600">
          Monitora e amministra gli utenti della piattaforma. I dati progetto degli utenti restano sempre privati.
        </p>
      </section>

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
