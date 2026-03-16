"use client";

import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { ApiErrorPayload, buildApiErrorMessage, readJsonSafe } from "@/lib/client/http";

type GoogleSheetsSnapshot = {
  connected: boolean;
  connectedEmail?: string;
  scope?: string;
  tokenType?: string;
  updatedAt?: string;
};

export function GoogleSheetsPersonalCard({ initial }: { initial: GoogleSheetsSnapshot }) {
  const router = useRouter();
  const searchParams = useSearchParams();

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const oauthStatus = searchParams.get("google_sheets");
  const oauthReason = searchParams.get("reason");

  const disconnect = async () => {
    if (!window.confirm("Disconnettere Google Sheets da questo account?")) {
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const response = await fetch("/api/integrations/google-sheets/disconnect", { method: "POST" });
      const payload = await readJsonSafe<ApiErrorPayload>(response);
      if (!response.ok) {
        throw new Error(buildApiErrorMessage(response, payload, "Disconnessione Google Sheets non riuscita"));
      }

      router.refresh();
    } catch (disconnectError) {
      setError(disconnectError instanceof Error ? disconnectError.message : "Errore imprevisto");
    } finally {
      setLoading(false);
    }
  };

  return (
    <section id="google-sheets" className="card space-y-4 scroll-mt-24">
      <div>
        <h2 className="text-lg font-semibold">Google Sheets personale</h2>
        <p className="text-sm text-slate-600">
          Collega il tuo account Google per esportare keyword direttamente su file Sheets nel tuo Drive.
        </p>
      </div>

      {oauthStatus === "connected" && <p className="text-sm text-green-700">Account Google Sheets collegato con successo.</p>}
      {oauthStatus === "error" && (
        <p className="text-sm text-red-700">Connessione Google Sheets non riuscita: {oauthReason ?? "errore sconosciuto"}</p>
      )}

      <div className="space-y-2 rounded-xl border border-slate-200 bg-slate-50 p-4 text-sm">
        <p>
          <span className="font-medium">Stato:</span> {initial.connected ? "Connesso" : "Non connesso"}
        </p>
        <p>
          <span className="font-medium">Email:</span> {initial.connectedEmail ?? "-"}
        </p>
        <p>
          <span className="font-medium">Scope:</span> {initial.scope ?? "-"}
        </p>
      </div>

      {!initial.connected ? (
        <a className="btn-primary w-full text-center sm:w-auto" href="/api/integrations/google-sheets/connect">
          Connetti a Google Sheets
        </a>
      ) : (
        <button className="btn-danger w-full sm:w-auto" type="button" onClick={disconnect} disabled={loading}>
          {loading ? "Disconnessione..." : "Disconnetti Google Sheets"}
        </button>
      )}

      {error && <p className="text-sm text-red-700">{error}</p>}
    </section>
  );
}