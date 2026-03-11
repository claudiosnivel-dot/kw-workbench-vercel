import { ProjectForm } from "@/components/project-form";

export default function NewProjectPage() {
  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-semibold">Nuovo progetto</h1>
      <div className="card">
        <ProjectForm mode="create" />
      </div>
    </div>
  );
}