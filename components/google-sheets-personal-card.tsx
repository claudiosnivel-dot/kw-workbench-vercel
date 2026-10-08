"use client";

import { useTranslations } from "next-intl";
import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { CardIntro } from "@/components/card-intro";
import { ApiErrorPayload, messageOf, readApiResponse } from "@/lib/client/http";

type GoogleSheetsSnapshot = {
  connected: boolean;
  status: "connected" | "reauth_required" | "disconnected";
  needsReconnect: boolean;
  connectedEmail?: string;
  scope?: string;
  tokenType?: string;
  updatedAt?: string;
};

// Codici di errore del collegamento (whitelist di T-906): il testo arriva dal catalogo, un codice sconosciuto ha un
// testo generico e il valore dell'URL non viene mai mostrato.
const OAUTH_REASONS = [
  "accesso_negato",
  "stato_non_valido",
  "config_oauth_mancante",
  "scope_mancante",
  "scambio_token_fallito",
  "sessione_scaduta",
] as const;

function oauthReasonKey(reason: string | null): (typeof OAUTH_REASONS)[number] | "unknown" {
  return OAUTH_REASONS.find((allowed) => allowed === reason) ?? "unknown";
}

export function GoogleSheetsPersonalCard({ initial }: { initial: GoogleSheetsSnapshot }) {
  const t = useTranslations("integrations.sheetsPersonal");
  const tErrors = useTranslations("errors");
  const tCommon = useTranslations("common");
  const router = useRouter();
  const searchParams = useSearchParams();

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const oauthStatus = searchParams.get("google_sheets");
  const oauthReason = searchParams.get("reason");

  const disconnect = async () => {
    if (!window.confirm(t("disconnectConfirm"))) {
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const response = await fetch("/api/integrations/google-sheets/disconnect", { method: "POST" });
      await readApiResponse<ApiErrorPayload>(response, tErrors);

      router.refresh();
    } catch (disconnectError) {
      setError(messageOf(disconnectError, tCommon("unexpectedError")));
    } finally {
      setLoading(false);
    }
  };

  return (
    <section id="google-sheets" className="card space-y-4 scroll-mt-24">
      <CardIntro title={t("title")} intro={t("intro")} />

      {oauthStatus === "connected" && <p className="text-sm text-green-700">{t("connected")}</p>}
      {oauthStatus === "error" && (
        <p className="text-sm text-red-700">{t("failed", { reason: t(`reasons.${oauthReasonKey(oauthReason)}`) })}</p>
      )}

      <div className="space-y-2 rounded-xl border border-slate-200 bg-slate-50 p-4 text-sm">
        <p>
          <span className="font-medium">{t("statusLabel")}</span> {t(`statuses.${initial.status}`)}
        </p>
        <p>
          <span className="font-medium">{t("emailLabel")}</span> {initial.connectedEmail ?? "-"}
        </p>
        <p>
          <span className="font-medium">{t("scopeLabel")}</span> {initial.scope ?? "-"}
        </p>
      </div>

      {initial.connected && initial.needsReconnect && initial.status === "connected" && (
        <p className="text-sm text-amber-700">{t("broaderScope")}</p>
      )}

      {/* Rotta API che avvia il redirect OAuth, non una pagina: serve una navigazione completa, non <Link>. La regola
          no-html-link-for-pages la scambia per una pagina perché il segmento dinamico app/[lang] (T-1801) combacia con
          ogni percorso senza punti. */}
      {initial.connected && (initial.status === "reauth_required" || initial.needsReconnect) && (
        // eslint-disable-next-line @next/next/no-html-link-for-pages
        <a className="btn-primary w-full text-center sm:w-auto" href="/api/integrations/google-sheets/connect">
          {t("reconnect")}
        </a>
      )}

      {!initial.connected ? (
        // eslint-disable-next-line @next/next/no-html-link-for-pages
        <a className="btn-primary w-full text-center sm:w-auto" href="/api/integrations/google-sheets/connect">
          {t("connect")}
        </a>
      ) : (
        <button className="btn-danger w-full sm:w-auto" type="button" onClick={disconnect} disabled={loading}>
          {loading ? t("disconnecting") : t("disconnect")}
        </button>
      )}

      {error && <p className="text-sm text-red-700">{error}</p>}
    </section>
  );
}