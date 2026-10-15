import { AdminAuditLogCard } from "@/components/admin-audit-log-card";
import { listAuditLog } from "@/lib/admin/audit";
import { requireRootAdminPageUser } from "@/lib/admin/page-access";

export const dynamic = "force-dynamic";

/** Registro dell'amministrazione (T-3301), del solo root admin: le azioni amministrative (T-1704). */
export default async function AdminLogPage() {
  await requireRootAdminPageUser();

  return <AdminAuditLogCard initial={await listAuditLog()} />;
}
