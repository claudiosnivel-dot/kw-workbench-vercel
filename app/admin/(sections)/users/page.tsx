import { AdminUsersDashboard } from "@/components/admin-users-dashboard";
import { requireAdminPageUser } from "@/lib/admin/page-access";

export const dynamic = "force-dynamic";

/**
 * Utenti dell'amministrazione (T-3301, T-3303), per ogni admin: filtri, elenco e «Crea utente». Le regole di visibilità e
 * di creazione restano delle rotte /api/admin/users (T-507).
 */
export default async function AdminUsersPage() {
  const user = await requireAdminPageUser();

  return <AdminUsersDashboard viewer={{ id: user.id, isRootAdmin: user.isRootAdmin }} />;
}
