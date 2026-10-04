import { ProjectForm } from "@/components/project-form";
import { requirePageUser } from "@/lib/auth/page-guard";

export const dynamic = "force-dynamic";

export default async function NewProjectPage() {
  const user = await requirePageUser();

  return (
    <div className="space-y-6">
      <section className="card">
        <h1 className="text-2xl font-semibold">Nuovo progetto</h1>
        <p className="mt-2 text-sm text-slate-600">
          Crea il progetto in modo guidato: prima imposti le basi (nome, prima sezione, seed), poi eventuali opzioni avanzate.
        </p>
      </section>

      <section className="card">
        <ProjectForm mode="create" canEditAutocompleteProvider={user.isRootAdmin} showSeeds={true} showInitialSubprojectName={true} />
      </section>
    </div>
  );
}

