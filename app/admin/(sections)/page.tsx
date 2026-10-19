import { AdminAlerts } from "@/components/admin-alerts";
import { AdminKpiCard } from "@/components/admin-kpi-card";
import { MetricsSpendCard } from "@/components/metrics-spend-card";
import { getAdminAlertsData } from "@/lib/admin/alerts";
import { getPlatformKpi } from "@/lib/admin/kpi";
import { requireRootAdminPageUser } from "@/lib/admin/page-access";
import { getMetricsSpend } from "@/lib/modules/providers/metrics/metrics-ledger";

export const dynamic = "force-dynamic";

/**
 * Panoramica dell'amministrazione (T-3301, T-3302), del solo root admin: avvisi sull'AI e su DataForSEO (T-3902,
 * T-3903), indicatori della piattaforma e spesa DataForSEO.
 */
export default async function AdminOverviewPage() {
  const user = await requireRootAdminPageUser();
  const [alerts, kpi, metricsSpend] = await Promise.all([getAdminAlertsData(), getPlatformKpi(), getMetricsSpend()]);

  return (
    <>
      <AdminAlerts data={alerts} isRootAdmin={user.isRootAdmin} />
      <AdminKpiCard kpi={kpi} />
      <MetricsSpendCard spend={metricsSpend} />
    </>
  );
}
