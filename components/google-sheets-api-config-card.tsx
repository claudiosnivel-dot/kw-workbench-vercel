"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { type ApiErrorPayload, buildApiErrorMessage, readJsonSafe } from "@/lib/client/http";

type ConfigField = "clientId" | "clientSecret" | "redirectUri";

type GoogleSheetsApiConfigSnapshot = {
  clientId: string;
  redirectUri: string;
  hasClientSecret: boolean;
  sources: Record<ConfigField, "db" | "env" | "none">;
};

const SOURCE_LABELS = { db: "salvato qui", env: "variabile d'ambiente", none: "non configurato" } as const;

const FIELD_LABELS: Record<ConfigField, string> = {
  clientId: "Client ID",
  clientSecret: "Client Secret",
  redirectUri: "Redirect URI",
};

export function GoogleSheetsApiConfigCard({ initial }: { initial: GoogleSheetsApiConfigSnapshot }) {
  const router = useRouter();
  const [clientId, setClientId] = useState(initial.clientId);
  const [redirectUri, setRedirectUri] = useState(initial.redirectUri);
  const [clientSecret, setClientSecret] = useState("");
  const [saving, setSaving] = useState(false);
  // Esito dell'ultima richiesta: errore (role=alert) o conferma (role=status).
  const [outcome, setOutcome] = useState<{ failed: boolean; text: string } | null>(null);

  /** Invia la PATCH (T-908): solo i campi cambiati, null per rimuovere un override; poi ricarica i dati del server. */
  const send = async (body: Partial<Record<ConfigField, string | null>>, successMessage: string) => {
    setSaving(true);
    setOutcome(null);
    const response = await fetch("/api/integrations/google-sheets/config", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }).catch(() => null);
    const payload = response
      ? await readJsonSafe<ApiErrorPayload & { data?: GoogleSheetsApiConfigSnapshot }>(response)
      : null;
    setSaving(false);

    if (!response?.ok) {
      const fallback = "Salvataggio configurazione Google Sheets non riuscito";
      setOutcome({ failed: true, text: response ? buildApiErrorMessage(response, payload, fallback) : fallback });
      return;
    }
    if (payload?.data) {
      setClientId(payload.data.clientId);
      setRedirectUri(payload.data.redirectUri);
    }
    setClientSecret("");
    setOutcome({ failed: false, text: successMessage });
    router.refresh();
  };

  const save = () =>
    send(
      {
        ...(clientId !== initial.clientId ? { clientId } : {}),
        ...(clientSecret ? { clientSecret } : {}),
        ...(redirectUri !== initial.redirectUri ? { redirectUri } : {}),
      },
      "Configurazione OAuth Google Sheets salvata."
    );

  const removeOverride = (field: ConfigField) =>
    send({ [field]: null }, `Override di ${FIELD_LABELS[field]} rimosso: vale la variabile d'ambiente, se presente.`);

  const sourceNote = (field: ConfigField) => (
    <p className="mt-1 flex flex-wrap items-center gap-2 text-xs text-slate-500">
      Fonte: {SOURCE_LABELS[initial.sources[field]]}
      {initial.sources[field] === "db" && (
        <button
          className="btn-secondary px-2 py-0.5 text-xs"
          type="button"
          onClick={() => removeOverride(field)}
          disabled={saving}
          aria-label={`Rimuovi override ${FIELD_LABELS[field]}`}
        >
          Rimuovi override
        </button>
      )}
    </p>
  );

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
          {sourceNote("clientId")}
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
          {sourceNote("redirectUri")}
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
          {sourceNote("clientSecret")}
        </div>
      </div>

      <button className="btn-primary w-full sm:w-auto" type="button" onClick={save} disabled={saving}>
        {saving ? "Salvataggio..." : "Salva configurazione Google Sheets"}
      </button>

      {outcome?.failed && (
        <p className="text-sm text-red-700" role="alert">
          {outcome.text}
        </p>
      )}
      <p className="text-sm text-green-700" role="status">
        {outcome && !outcome.failed ? outcome.text : null}
      </p>
    </section>
  );
}
