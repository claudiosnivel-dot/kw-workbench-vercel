import { redirect } from "next/navigation";
import { AdminUsersDashboard } from "@/components/admin-users-dashboard";
import { isAdminUser, requireAuthenticatedUserFromCookies } from "@/lib/auth/current-user";

export const dynamic = "force-dynamic";

export default async function AdminPage() {
  const user = await requireAuthenticatedUserFromCookies();

  if (!isAdminUser(user)) {
    redirect("/");
  }

  return (
    <div className="space-y-6">
      <section className="card">
        <h1 className="text-2xl font-semibold">Dashboard Admin</h1>
        <p className="mt-2 text-sm text-slate-600">
          Monitora e amministra gli utenti della piattaforma. I dati progetto degli utenti restano sempre privati.
        </p>
      </section>

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