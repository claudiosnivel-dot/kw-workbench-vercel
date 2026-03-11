"use client";

import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";

type GoogleAdsSnapshot = {
  connected: boolean;
  connectedEmail?: string;
  customerId?: string;
  loginCustomerId?: string;
  scope?: string;
  tokenType?: string;
  updatedAt?: string;
};

type GoogleAdsApiConfig = {
  clientId: string;
  redirectUri: string;
  apiVersion: string;
  batchSize: number;
  hasDeveloperToken: boolean;
  hasClientSecret: boolean;
};

export function GoogleAdsIntegrationCard({
  initial,
  apiConfig,
}: {
  initial: GoogleAdsSnapshot;
  apiConfig: GoogleAdsApiConfig;
}) {
  const router = useRouter();
  const searchParams = useSearchParams();

  const [customerId, setCustomerId] = useState(initial.customerId ?? "");
  const [loginCustomerId, setLoginCustomerId] = useState(initial.loginCustomerId ?? "");

  const [developerToken, setDeveloperToken] = useState("");
  const [clientId, setClientId] = useState(apiConfig.clientId ?? "");
  const [clientSecret, setClientSecret] = useState("");
  const [redirectUri, setRedirectUri] = useState(apiConfig.redirectUri ?? "");
  const [apiVersion, setApiVersion] = useState(apiConfig.apiVersion ?? "v18");
  const [batchSize, setBatchSize] = useState(apiConfig.batchSize ?? 20);

  const [loadingApi, setLoadingApi] = useState(false);
  const [loadingAccount, setLoadingAccount] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const oauthStatus = searchParams.get("google_ads");
  const oauthReason = searchParams.get("reason");

  const saveApiConfig = async () => {
    setLoadingApi(true);
    setError(null);

    try {
      const response = await fetch("/api/integrations/google-ads/config", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          developerToken,
          clientId,
          clientSecret,
          redirectUri,
          apiVersion,
          batchSize,
        }),
      });

      const payload = (await response.json()) as { error?: string };
      if (!response.ok) {
        throw new Error(payload.error ?? "Impossibile salvare la configurazione API Google Ads");
      }

      setDeveloperToken("");
      setClientSecret("");
      router.refresh();
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Errore imprevisto");
    } finally {
      setLoadingApi(false);
    }
  };

  const saveAccountSettings = async () => {
    setLoadingAccount(true);
    setError(null);
    try {
      const response = await fetch("/api/integrations/google-ads", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ customerId, loginCustomerId }),
      });

      const payload = (await response.json()) as { error?: string };
      if (!response.ok) {
        throw new Error(payload.error ?? "Impossibile aggiornare le impostazioni account");
      }

      router.refresh();
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Errore imprevisto");
    } finally {
      setLoadingAccount(false);
    }
  };

  const disconnect = async () => {
    if (!window.confirm("Disconnettere l'integrazione Google Ads?")) {
      return;
    }

    setLoadingAccount(true);
    setError(null);

    try {
      const response = await fetch("/api/integrations/google-ads/disconnect", { method: "POST" });
      if (!response.ok) {
        throw new Error("Impossibile disconnettere Google Ads");
      }
      router.refresh();
    } catch (disconnectError) {
      setError(disconnectError instanceof Error ? disconnectError.message : "Errore imprevisto");
    } finally {
      setLoadingAccount(false);
    }
  };

  return (
    <section className="card space-y-6">
      <div>
        <h2 className="text-lg font-semibold">Google Keyword Planner</h2>
        <p className="text-sm text-slate-600">
          Configura qui credenziali OAuth/API, poi collega il tuo account per usare metriche reali di Keyword Planner.
        </p>
      </div>

      {oauthStatus === "connected" && <p className="text-sm text-green-700">Google Ads collegato con successo.</p>}
      {oauthStatus === "error" && (
        <p className="text-sm text-red-700">Connessione Google Ads non riuscita: {oauthReason ?? "errore sconosciuto"}</p>
      )}

      <div className="space-y-3 rounded-xl border border-slate-200 bg-slate-50 p-4">
        <h3 className="text-sm font-semibold uppercase tracking-wide text-slate-600">Configurazione API Google Ads</h3>

        <div className="grid gap-3 md:grid-cols-2">
          <div>
            <label className="label" htmlFor="clientId">
              OAuth Client ID
            </label>
            <input
              id="clientId"
              className="input"
              value={clientId}
              onChange={(event) => setClientId(event.target.value)}
              placeholder="xxxxxxxx.apps.googleusercontent.com"
            />
          </div>

          <div>
            <label className="label" htmlFor="redirectUri">
              OAuth Redirect URI
            </label>
            <input
              id="redirectUri"
              className="input"
              value={redirectUri}
              onChange={(event) => setRedirectUri(event.target.value)}
              placeholder="http://localhost:3000/api/integrations/google-ads/callback"
            />
          </div>

          <div>
            <label className="label" htmlFor="developerToken">
              Developer Token
            </label>
            <input
              id="developerToken"
              className="input"
              type="password"
              value={developerToken}
              onChange={(event) => setDeveloperToken(event.target.value)}
              placeholder={apiConfig.hasDeveloperToken ? "Configurato (inserisci per sostituire)" : "Inserisci developer token"}
            />
          </div>

          <div>
            <label className="label" htmlFor="clientSecret">
              OAuth Client Secret
            </label>
            <input
              id="clientSecret"
              className="input"
              type="password"
              value={clientSecret}
              onChange={(event) => setClientSecret(event.target.value)}
              placeholder={apiConfig.hasClientSecret ? "Configurato (inserisci per sostituire)" : "Inserisci client secret"}
            />
          </div>

          <div>
            <label className="label" htmlFor="apiVersion">
              Versione API Google Ads
            </label>
            <input
              id="apiVersion"
              className="input"
              value={apiVersion}
              onChange={(event) => setApiVersion(event.target.value)}
              placeholder="v18"
            />
          </div>

          <div>
            <label className="label" htmlFor="batchSize">
              Dimensione batch
            </label>
            <input
              id="batchSize"
              className="input"
              type="number"
              min={1}
              value={batchSize}
              onChange={(event) => setBatchSize(Number(event.target.value) || 20)}
            />
          </div>
        </div>

        <button className="btn-primary" disabled={loadingApi} onClick={saveApiConfig} type="button">
          {loadingApi ? "Salvataggio configurazione API..." : "Salva configurazione API"}
        </button>
      </div>

      <div className="space-y-3 rounded-xl border border-slate-200 bg-slate-50 p-4 text-sm">
        <h3 className="text-sm font-semibold uppercase tracking-wide text-slate-600">Connessione account Google Ads</h3>
        <p>
          <span className="font-medium">Stato:</span> {initial.connected ? "Connesso" : "Non connesso"}
        </p>
        <p>
          <span className="font-medium">Email:</span> {initial.connectedEmail ?? "-"}
        </p>
        <p>
          <span className="font-medium">Scope:</span> {initial.scope ?? "-"}
        </p>

        {!initial.connected ? (
          <a className="btn-primary" href="/api/integrations/google-ads/connect">
            Collega Google Ads
          </a>
        ) : (
          <>
            <div className="grid gap-3 md:grid-cols-2">
              <div>
                <label className="label" htmlFor="customerId">
                  Google Ads Customer ID
                </label>
                <input
                  id="customerId"
                  className="input"
                  value={customerId}
                  onChange={(event) => setCustomerId(event.target.value)}
                  placeholder="1234567890"
                />
              </div>
              <div>
                <label className="label" htmlFor="loginCustomerId">
                  Customer ID login (opzionale)
                </label>
                <input
                  id="loginCustomerId"
                  className="input"
                  value={loginCustomerId}
                  onChange={(event) => setLoginCustomerId(event.target.value)}
                  placeholder="0987654321"
                />
              </div>
            </div>

            <div className="flex flex-wrap gap-3">
              <button className="btn-primary" disabled={loadingAccount} onClick={saveAccountSettings} type="button">
                {loadingAccount ? "Salvataggio..." : "Salva impostazioni account"}
              </button>
              <button
                className="btn inline-flex items-center justify-center rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-500"
                disabled={loadingAccount}
                onClick={disconnect}
                type="button"
              >
                Disconnetti
              </button>
            </div>
          </>
        )}
      </div>

      {error && <p className="text-sm text-red-700">{error}</p>}
    </section>
  );
}
