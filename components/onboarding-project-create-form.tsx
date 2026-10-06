"use client";

import { FormEvent, useState } from "react";
import { submitOnboardingCreation } from "@/lib/client/onboarding";

const IDEMPOTENCY_STORAGE_KEY = "onboarding-idempotency:project-create";

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
      const nextPath = await submitOnboardingCreation(
        "/api/onboarding/project",
        IDEMPOTENCY_STORAGE_KEY,
        { name: trimmedName },
        "Creazione progetto non riuscita"
      );
      window.location.assign(nextPath ?? "/onboarding/project-targeting");
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
