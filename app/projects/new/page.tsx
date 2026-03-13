import { ProjectForm } from "@/components/project-form";

export default function NewProjectPage() {
  return (
    <div className="space-y-6">
      <section className="card">
        <h1 className="text-2xl font-semibold">Nuovo progetto</h1>
        <p className="mt-2 text-sm text-slate-600">
          Configura locale, seed, provider e regole di espansione. Potrai modificare tutto anche in seguito.
        </p>
      </section>

      <section className="card">
        <ProjectForm mode="create" />
      </section>
    </div>
  );
}