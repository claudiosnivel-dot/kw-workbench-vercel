"use client";

import { useState } from "react";
import { ApiErrorPayload, buildApiErrorMessage, readJsonSafe } from "@/lib/client/http";

type GoogleSheetsApiConfigSnapshot = {
  clientId: string;
  redirectUri: string;
  hasClientSecret: boolean;
};

export function GoogleSheetsApiConfigCard({ initial }: { initial: GoogleSheetsApiConfigSnapshot }) {
  const [clientId, setClientId] = useState(initial.clientId);
  const [redirectUri, setRedirectUri] = useState(initial.redirectUri);
  const [clientSecret, setClientSecret] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const save = async () => {
    setSaving(true);
    setError(null);
    setSuccess(null);

    try {
      const response = await fetch("/api/integrations/google-sheets/config", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          clientId,
          clientSecret,
          redirectUri,
        }),
      });

      const payload = await readJsonSafe<ApiErrorPayload>(response);
      if (!response.ok) {
        throw new Error(buildApiErrorMessage(response, payload, "Salvataggio configurazione Google Sheets non riuscito"));
      }

      setClientSecret("");
      setSuccess("Configurazione OAuth Google Sheets salvata.");
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Errore imprevisto");
    } finally {
      setSaving(false);
    }
  };

  return (
    <section className="card space-y-4">
      <div>
        <h2 className="text-lg font-semibold">Google Sheets OAuth (globale app)</h2>
        <p className="text-sm text-slate-600">
          Configurazione tecnica usata per permettere agli utenti di collegare il proprio account Google Sheets.
        </p>
      </div>

      <div className="grid gap-3 md:grid-cols-2">
        <div>
          <label className="label" htmlFor="google-sheets-client-id">
            OAuth Client ID
          </label>
          <input
            id="google-sheets-client-id"
            className="input"
            value={clientId}
            onChange={(event) => setClientId(event.target.value)}
            placeholder="xxxxxxxx.apps.googleusercontent.com"
          />
        </div>

        <div>
          <label className="label" htmlFor="google-sheets-redirect-uri">
            OAuth Redirect URI
          </label>
          <input
            id="google-sheets-redirect-uri"
            className="input"
            value={redirectUri}
            onChange={(event) => setRedirectUri(event.target.value)}
            placeholder="https://tuodominio.com/api/integrations/google-sheets/callback"
          />
        </div>

        <div className="md:col-span-2">
          <label className="label" htmlFor="google-sheets-client-secret">
            OAuth Client Secret
          </label>
          <input
            id="google-sheets-client-secret"
            className="input"
            type="password"
            value={clientSecret}
            onChange={(event) => setClientSecret(event.target.value)}
            placeholder={initial.hasClientSecret ? "Configurato (inserisci per sostituire)" : "Inserisci client secret"}
          />
        </div>
      </div>

      <button className="btn-primary w-full sm:w-auto" type="button" onClick={save} disabled={saving}>
        {saving ? "Salvataggio..." : "Salva configurazione Google Sheets"}
      </button>

      {error && <p className="text-sm text-red-700">{error}</p>}
      {success && <p className="text-sm text-green-700">{success}</p>}
    </section>
  );
}