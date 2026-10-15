import { AdminKpiCard } from "@/components/admin-kpi-card";
import { MetricsSpendCard } from "@/components/metrics-spend-card";
import { getPlatformKpi } from "@/lib/admin/kpi";
import { requireRootAdminPageUser } from "@/lib/admin/page-access";
import { getMetricsSpend } from "@/lib/modules/providers/metrics/metrics-ledger";

export const dynamic = "force-dynamic";

/** Panoramica dell'amministrazione (T-3301, T-3302), del solo root admin: indicatori della piattaforma e spesa DataForSEO. */
export default async function AdminOverviewPage() {
  await requireRootAdminPageUser();
  const [kpi, metricsSpend] = await Promise.all([getPlatformKpi(), getMetricsSpend()]);

  return (
    <>
      <AdminKpiCard kpi={kpi} />
      <MetricsSpendCard spend={metricsSpend} />
    </>
  );
}
