"use client";

import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { CardIntro } from "@/components/card-intro";
import { type ApiErrorPayload, buildApiErrorMessage, readJsonSafe } from "@/lib/client/http";

type ConfigField = "clientId" | "clientSecret" | "redirectUri";

type GoogleSheetsApiConfigSnapshot = {
  clientId: string;
  redirectUri: string;
  hasClientSecret: boolean;
  sources: Record<ConfigField, "db" | "env" | "none">;
};

export function GoogleSheetsApiConfigCard({ initial }: { initial: GoogleSheetsApiConfigSnapshot }) {
  const t = useTranslations("integrations.sheetsConfig");
  const tErrors = useTranslations("errors");
  const tCommon = useTranslations("common");
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
      setOutcome({ failed: true, text: response ? buildApiErrorMessage(response, payload, tErrors) : t("saveFailed") });
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
      t("saved")
    );

  const removeOverride = (field: ConfigField) =>
    send({ [field]: null }, t("overrideRemoved", { field: t(`fields.${field}`) }));

  const sourceNote = (field: ConfigField) => (
    <p className="mt-1 flex flex-wrap items-center gap-2 text-xs text-slate-500">
      {t("source", { source: initial.sources[field] })}
      {initial.sources[field] === "db" && (
        <button
          className="btn-secondary px-2 py-0.5 text-xs"
          type="button"
          onClick={() => removeOverride(field)}
          disabled={saving}
          aria-label={t("removeOverrideAria", { field: t(`fields.${field}`) })}
        >
          {t("removeOverride")}
        </button>
      )}
    </p>
  );

  return (
    <section className="card space-y-4">
      <CardIntro title={t("title")} intro={t("intro")} />

      <div className="grid gap-3 md:grid-cols-2">
        <div>
          <label className="label" htmlFor="google-sheets-client-id">
            {t("clientIdLabel")}
          </label>
          <input
            id="google-sheets-client-id"
            className="input"
            value={clientId}
            onChange={(event) => setClientId(event.target.value)}
            placeholder={t("clientIdPlaceholder")}
          />
          {sourceNote("clientId")}
        </div>

        <div>
          <label className="label" htmlFor="google-sheets-redirect-uri">
            {t("redirectUriLabel")}
          </label>
          <input
            id="google-sheets-redirect-uri"
            className="input"
            value={redirectUri}
            onChange={(event) => setRedirectUri(event.target.value)}
            placeholder={t("redirectUriPlaceholder")}
          />
          {sourceNote("redirectUri")}
        </div>

        <div className="md:col-span-2">
          <label className="label" htmlFor="google-sheets-client-secret">
            {t("clientSecretLabel")}
          </label>
          <input
            id="google-sheets-client-secret"
            className="input"
            type="password"
            value={clientSecret}
            onChange={(event) => setClientSecret(event.target.value)}
            placeholder={initial.hasClientSecret ? t("secretConfigured") : t("secretPlaceholder")}
          />
          {sourceNote("clientSecret")}
        </div>
      </div>

      <button className="btn-primary w-full sm:w-auto" type="button" onClick={save} disabled={saving}>
        {saving ? tCommon("saving") : t("save")}
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
