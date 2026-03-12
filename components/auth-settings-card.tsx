"use client";

import { useState } from "react";
import { ApiErrorPayload, buildApiErrorMessage, readJsonSafe } from "@/lib/client/http";

type AuthSnapshot = {
  username: string;
  source: "env" | "db";
  hasPasswordOverride: boolean;
};

type AuthSettingsResponse = ApiErrorPayload & {
  data?: AuthSnapshot;
};

export function AuthSettingsCard({ initial }: { initial: AuthSnapshot }) {
  const [username, setUsername] = useState(initial.username);
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const save = async () => {
    setSaving(true);
    setError(null);
    setSuccess(null);

    try {
      const response = await fetch("/api/auth/config", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          currentPassword,
          username,
          newPassword,
          confirmPassword,
        }),
      });

      const payload = await readJsonSafe<AuthSettingsResponse>(response);
      if (!response.ok) {
        throw new Error(buildApiErrorMessage(response, payload, "Impossibile salvare le impostazioni di accesso"));
      }

      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
      setSuccess("Impostazioni di sicurezza aggiornate.");
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Errore imprevisto");
    } finally {
      setSaving(false);
    }
  };

  return (
    <section className="card space-y-4">
      <div>
        <h2 className="text-lg font-semibold">Sicurezza</h2>
        <p className="text-sm text-slate-600">Aggiorna le credenziali di accesso dalla dashboard senza modificare i file `.env`.</p>
      </div>

      <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 text-sm">
        <p>
          <span className="font-medium">Origine credenziali:</span> {initial.source === "db" ? "Configurazione dashboard" : "Fallback ENV"}
        </p>
        <p>
          <span className="font-medium">Username attivo:</span> {initial.username}
        </p>
      </div>

      <div className="grid gap-3 md:grid-cols-2">
        <div>
          <label className="label" htmlFor="authUsername">
            Nuovo username
          </label>
          <input
            id="authUsername"
            className="input"
            value={username}
            onChange={(event) => setUsername(event.target.value)}
            placeholder="admin"
          />
        </div>

        <div>
          <label className="label" htmlFor="currentPassword">
            Password attuale (obbligatoria)
          </label>
          <input
            id="currentPassword"
            type="password"
            className="input"
            value={currentPassword}
            onChange={(event) => setCurrentPassword(event.target.value)}
            placeholder="Password attuale"
          />
        </div>

        <div>
          <label className="label" htmlFor="newPassword">
            Nuova password (opzionale)
          </label>
          <input
            id="newPassword"
            type="password"
            className="input"
            value={newPassword}
            onChange={(event) => setNewPassword(event.target.value)}
            placeholder="Lascia vuoto per mantenerla"
          />
        </div>

        <div>
          <label className="label" htmlFor="confirmPassword">
            Conferma nuova password
          </label>
          <input
            id="confirmPassword"
            type="password"
            className="input"
            value={confirmPassword}
            onChange={(event) => setConfirmPassword(event.target.value)}
            placeholder="Conferma nuova password"
          />
        </div>
      </div>

      <button className="btn-primary w-full sm:w-auto" type="button" onClick={save} disabled={saving}>
        {saving ? "Salvataggio sicurezza..." : "Salva impostazioni sicurezza"}
      </button>

      {error && <p className="text-sm text-red-700">{error}</p>}
      {success && <p className="text-sm text-green-700">{success}</p>}
    </section>
  );
}
