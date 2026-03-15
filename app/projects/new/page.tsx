import { ProjectForm } from "@/components/project-form";
import { requireAuthenticatedUserFromCookies } from "@/lib/auth/current-user";

export const dynamic = "force-dynamic";

export default async function NewProjectPage() {
  const user = await requireAuthenticatedUserFromCookies();

  return (
    <div className="space-y-6">
      <section className="card">
        <h1 className="text-2xl font-semibold">Nuovo progetto</h1>
        <p className="mt-2 text-sm text-slate-600">
          Crea il progetto padre e il primo sottoprogetto operativo. In seguito potrai aggiungere altri sottoprogetti.
        </p>
      </section>

      <section className="card">
        <ProjectForm mode="create" canEditAutocompleteProvider={user.isRootAdmin} showSeeds={true} showInitialSubprojectName={true} />
      </section>
    </div>
  );
}
