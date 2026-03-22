"use client";

import { FormEvent, useState } from "react";
import { ApiErrorPayload, buildApiErrorMessage, readJsonSafe } from "@/lib/client/http";

type ProjectCreateResponse = ApiErrorPayload & {
  data?: {
    project?: { id: string };
    id?: string;
  };
};

export function OnboardingProjectCreateForm() {
  const [name, setName] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    const trimmedName = name.trim();
    if (!trimmedName) {
      setError("Inserisci il nome progetto.");
      return;
    }

    setSaving(true);
    setError(null);

    try {
      const response = await fetch("/api/projects", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: trimmedName,
          createInitialSection: false,
        }),
      });

      const payload = await readJsonSafe<ProjectCreateResponse>(response);
      if (!response.ok) {
        throw new Error(buildApiErrorMessage(response, payload, "Creazione progetto non riuscita"));
      }

      const projectId = payload?.data?.project?.id ?? payload?.data?.id;
      if (!projectId) {
        throw new Error("ID progetto mancante nella risposta.");
      }

      const onboardingResponse = await fetch("/api/onboarding/state", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          status: "IN_PROGRESS",
          currentStep: "PROJECT_TARGETING",
          activeProjectId: projectId,
          activeSubprojectId: null,
        }),
      });

      if (!onboardingResponse.ok) {
        throw new Error("Progetto creato, ma avanzamento onboarding non riuscito.");
      }

      window.location.assign("/onboarding/project-targeting");
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : "Errore imprevisto");
      setSaving(false);
    }
  };

  return (
    <section className="card space-y-4">
      <h2 className="text-xl font-semibold">Step 2: Crea progetto</h2>
      <p className="text-sm text-slate-600">
        Il progetto e il contenitore principale (es. dominio, brand o cliente).
      </p>
      <form className="space-y-4" onSubmit={submit}>
        <div>
          <label className="label" htmlFor="onboarding-project-name">
            Nome progetto
          </label>
          <input
            id="onboarding-project-name"
            className="input"
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder="es. sermonescristiano.com"
            required
          />
        </div>

        <button className="btn-primary w-full sm:w-auto" type="submit" disabled={saving}>
          {saving ? "Creazione..." : "Crea progetto e continua"}
        </button>

        {error && <p className="text-sm text-red-700">{error}</p>}
      </form>
    </section>
  );
}
