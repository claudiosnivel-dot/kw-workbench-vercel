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

/**
 * Perché il collegamento va rifatto (T-2902): Google ha rifiutato il rinnovo o la credenziale è illeggibile
 * (reauth_required, T-906), oppure lo scope è più ampio di drive.file (needsReconnect, T-907); null se non serve.
 */
function reconnectReasonKey(snapshot: GoogleSheetsSnapshot): "reauthReason" | "broaderScope" | null {
  if (!snapshot.connected) return null;
  if (snapshot.status === "reauth_required") return "reauthReason";
  return snapshot.needsReconnect ? "broaderScope" : null;
}

/** Collegamento personale a Google Sheets nella sezione Collegamenti (T-906, T-907, T-2902). */
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
  const reconnectReason = reconnectReasonKey(initial);

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

      {/* Tre stati in parole semplici (T-2902): da ricollegare con il perché, collegato con l'email, non collegato. */}
      {reconnectReason ? (
        <div className="space-y-1 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
          <p className="font-medium">{t("needsReconnect")}</p>
          <p>{t(reconnectReason)}</p>
        </div>
      ) : (
        initial.connected && (
          <p className="text-sm">
            {initial.connectedEmail ? t("connectedAs", { email: initial.connectedEmail }) : t("connectedPlain")}
          </p>
        )
      )}

      {/* Rotta API che avvia il redirect OAuth, non una pagina: serve una navigazione completa, non <Link>. La regola
          no-html-link-for-pages la scambia per una pagina perché il segmento dinamico app/[lang] (T-1801) combacia con
          ogni percorso senza punti. */}
      {reconnectReason && (
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