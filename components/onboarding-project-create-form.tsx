"use client";

import { FormEvent, useRef, useState } from "react";
import { ApiErrorPayload, buildApiErrorMessage, readJsonSafe } from "@/lib/client/http";
import { clearIdempotencyKey, readIdempotencyKey } from "@/lib/client/idempotency-key";

type ProjectCreateResponse = ApiErrorPayload & {
  data?: {
    projectId?: string;
    nextPath?: string;
  };
};

const IDEMPOTENCY_STORAGE_KEY = "onboarding-idempotency:project-create";

export function OnboardingProjectCreateForm() {
  const [name, setName] = useState("");
  const idempotencyKey = useRef<string | null>(null);
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
      // Stessa chiave per i nuovi tentativi, anche dopo un reload: un retry non crea un secondo progetto.
      idempotencyKey.current ??= readIdempotencyKey(IDEMPOTENCY_STORAGE_KEY);
      const response = await fetch("/api/onboarding/project", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: trimmedName, idempotencyKey: idempotencyKey.current }),
      });

      const payload = await readJsonSafe<ProjectCreateResponse>(response);
      if (!response.ok) {
        throw new Error(buildApiErrorMessage(response, payload, "Creazione progetto non riuscita"));
      }

      clearIdempotencyKey(IDEMPOTENCY_STORAGE_KEY);
      window.location.assign(payload?.data?.nextPath ?? "/onboarding/project-targeting");
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
