import { redirect } from "next/navigation";
import { AdminUsersDashboard } from "@/components/admin-users-dashboard";
import { BrandingSettingsCard } from "@/components/branding-settings-card";
import { GoogleSheetsApiConfigCard } from "@/components/google-sheets-api-config-card";
import { MetricsSpendCard } from "@/components/metrics-spend-card";
import { isAdminUser } from "@/lib/auth/current-user";
import { requirePageUser } from "@/lib/auth/page-guard";
import { getBrandingSnapshot } from "@/lib/integrations/branding";
import { getGoogleSheetsApiConfigSnapshot } from "@/lib/integrations/google-sheets-config";
import { getMetricsSpend } from "@/lib/modules/providers/metrics/metrics-ledger";

export const dynamic = "force-dynamic";

export default async function AdminPage() {
  const user = await requirePageUser();

  if (!isAdminUser(user)) {
    redirect("/");
  }

  const [branding, googleSheetsConfig, metricsSpend] = await Promise.all([
    getBrandingSnapshot(),
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