"use client";

import Link from "next/link";
import { FormEvent, useState } from "react";
import { submitOnboardingCreation } from "@/lib/client/onboarding";

type OnboardingSectionCreateFormProps = {
  projectId: string;
  projectName: string;
};

export function OnboardingSectionCreateForm({ projectId, projectName }: OnboardingSectionCreateFormProps) {
  const [name, setName] = useState("Generale");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const trimmedName = name.trim();

    if (!trimmedName) {
      setError("Inserisci il nome sezione.");
      return;
    }

    setSaving(true);
    setError(null);

    try {
      const nextPath = await submitOnboardingCreation(
        "/api/onboarding/section",
        `onboarding-idempotency:section-create:${projectId}`,
        { projectId, name: trimmedName },
        "Creazione sezione non riuscita"
      );
      window.location.assign(nextPath ?? "/onboarding/seeds");
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : "Errore imprevisto");
      setSaving(false);
    }
  };

  return (
    <section className="card space-y-4">
      <h2 className="text-xl font-semibold">Step 4: Crea sezione</h2>
      <p className="text-sm text-slate-600">
        Progetto attivo: <span className="font-medium">{projectName}</span>.
      </p>

      <form className="space-y-4" onSubmit={submit}>
        <div>
          <label className="label" htmlFor="onboarding-section-name">
            Nome sezione
          </label>
          <input
            id="onboarding-section-name"
            className="input"
            value={name}
            onChange={(event) => setName(event.target.value)}
            required
          />
          <p className="mt-1 text-xs text-slate-500">
            Esempio: categoria blog, cluster tematico, funnel, mercato o qualunque logica operativa.
          </p>
        </div>

        <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap">
          <button className="btn-primary w-full sm:w-auto" type="submit" disabled={saving}>
            {saving ? "Creazione..." : "Crea sezione e continua"}
          </button>
          <Link className="btn-secondary w-full text-center sm:w-auto" href="/onboarding/project-targeting">
            Torna allo step precedente
          </Link>
        </div>

        {error && <p className="text-sm text-red-700">{error}</p>}
      </form>
    </section>
  );
}
