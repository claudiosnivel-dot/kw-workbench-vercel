import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { AdminAuditLogCard } from "@/components/admin-audit-log-card";
import { AdminKpiCard } from "@/components/admin-kpi-card";
import { AdminLaunchCard } from "@/components/admin-launch-card";
import { AdminUsersDashboard } from "@/components/admin-users-dashboard";
import { BrandingSettingsCard } from "@/components/branding-settings-card";
import { GoogleSheetsApiConfigCard } from "@/components/google-sheets-api-config-card";
import { MetricsSpendCard } from "@/components/metrics-spend-card";
import { PageIntro } from "@/components/page-intro";
import { listAuditLog } from "@/lib/admin/audit";
import { getPlatformKpi } from "@/lib/admin/kpi";
import { isAdminUser } from "@/lib/auth/current-user";
import { requirePageUser } from "@/lib/auth/page-guard";
import { getLaunchChecklist, getLaunchState } from "@/lib/billing/launch";
import { getBrandingSnapshot } from "@/lib/integrations/branding";
import { getGoogleSheetsApiConfigSnapshot } from "@/lib/integrations/google-sheets-config";
import { getMetricsSpend } from "@/lib/modules/providers/metrics/metrics-ledger";

export const dynamic = "force-dynamic";

export default async function AdminPage() {
  const user = await requirePageUser();

  if (!isAdminUser(user)) {
    redirect("/");
  }

  const [t, branding, googleSheetsConfig, metricsSpend, launch, auditLog, kpi] = await Promise.all([
    getTranslations("admin"),
    getBrandingSnapshot(),
    user.isRootAdmin ? getGoogleSheetsApiConfigSnapshot() : Promise.resolve(null),
    user.isRootAdmin ? getMetricsSpend() : Promise.resolve(null),
    user.isRootAdmin ? getLaunchState() : Promise.resolve(null),
    user.isRootAdmin ? listAuditLog() : Promise.resolve(null),
    user.isRootAdmin ? getPlatformKpi() : Promise.resolve(null),
  ]);

  return (
    <div className="space-y-6">
      <PageIntro title={t("title")} intro={t("intro")} />

      {user.isRootAdmin && kpi && <AdminKpiCard kpi={kpi} />}

      {user.isRootAdmin && launch && <AdminLaunchCard launch={{ ...launch, checklist: getLaunchChecklist() }} />}

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

      {user.isRootAdmin && auditLog && <AdminAuditLogCard initial={auditLog} />}

      <AdminUsersDashboard
        viewer={{
          id: user.id,
          isRootAdmin: user.isRootAdmin,
        }}
      />
    </div>
  );
}