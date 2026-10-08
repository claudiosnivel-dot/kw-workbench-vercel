"use client";

import Link from "next/link";
import { useTranslations } from "next-intl";
import { FormEvent, useState } from "react";
import { TermsConsentCheckbox } from "@/components/terms-consent-checkbox";
import { useTurnstile } from "@/components/turnstile-widget";
import { type CredentialsResponse, postCredentials } from "@/lib/client/auth";
import { useFormValues } from "@/lib/client/use-form-values";
import { useLeavingAction } from "@/lib/client/use-leaving-action";

type CredentialsField = {
  id: "email" | "displayName" | "password" | "confirmPassword";
  type: "email" | "text" | "password";
  autoComplete: string;
  required: boolean;
};

const EMAIL_FIELD: CredentialsField = { id: "email", type: "email", autoComplete: "email", required: true };

const LOGIN_FIELDS: CredentialsField[] = [
  EMAIL_FIELD,
  { id: "password", type: "password", autoComplete: "current-password", required: true },
];

// Identità via email (T-1401): il nome mostrato è facoltativo, di default la parte locale dell'email.
const REGISTER_FIELDS: CredentialsField[] = [
  EMAIL_FIELD,
  { id: "displayName", type: "text", autoComplete: "nickname", required: false },
  { id: "password", type: "password", autoComplete: "new-password", required: true },
  { id: "confirmPassword", type: "password", autoComplete: "new-password", required: true },
];

/**
 * Form di accesso e di registrazione (T-1303). Dopo l'accesso apre redirectPath, già ridotto a un percorso della stessa
 * origine dal chiamante (T-303), oppure prima /accept-terms se i termini correnti non sono accettati (T-1405). Dopo la
 * registrazione, che richiede l'accettazione dei termini di termsVersion, mostra «Controlla la tua email» (T-1403); con
 * turnstileSiteKey la registrazione invia anche il token del CAPTCHA (T-1702). Un accesso dopo un reset da admin apre la
 * pagina del cambio password obbligato (T-1704).
 */
export function CredentialsForm({
  mode,
  redirectPath,
  termsVersion,
  turnstileSiteKey,
}: {
  mode: "login" | "register";
  redirectPath: string;
  termsVersion?: string;
  turnstileSiteKey?: string | null;
}) {
  const t = useTranslations("auth");
  const { values, update } = useFormValues({ email: "", displayName: "", password: "", confirmPassword: "" });
  const [acceptTerms, setAcceptTerms] = useState(false);
  const [registered, setRegistered] = useState(false);
  const { pending, error, run } = useLeavingAction();
  const loading = pending !== null;
  const fields = mode === "login" ? LOGIN_FIELDS : REGISTER_FIELDS;
  const captcha = useTurnstile(mode === "register" ? turnstileSiteKey : null, "register");

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const credentials = Object.fromEntries(fields.map((field) => [field.id, values[field.id]]));
    const body =
      mode === "register" ? { ...credentials, acceptTerms, termsVersion, turnstileToken: captcha.token } : credentials;
    void run(async (tErrors) => {
      try {
        const payload = await postCredentials(`/api/auth/${mode}`, body, tErrors);
        if (mode === "register") {
          setRegistered(true);
          return;
        }
        window.location.assign(nextPageAfterLogin(payload, redirectPath));
      } catch (error) {
        // Il token del CAPTCHA è monouso: dopo un invio non riuscito ne serve uno nuovo.
        captcha.reset();
        throw error;
      }
    });
  };

  if (registered) {
    return (
      <div className="space-y-4">
        <p role="status" className="rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-900">
          {t("register.checkEmail")}
        </p>
        <Link href={`/login?next=${encodeURIComponent(redirectPath)}`} className="btn-secondary w-full text-center sm:w-auto">
          {t("register.loginLink")}
        </Link>
      </div>
    );
  }

  return (
    <form className="space-y-4" onSubmit={submit}>
      {fields.map((field) => (
        <div key={field.id}>
          <label className="label" htmlFor={field.id}>
            {t(field.id)}
          </label>
          <input
            id={field.id}
            className="input"
            type={field.type}
            value={values[field.id]}
            onChange={(event) => update(field.id, event.target.value)}
            autoComplete={field.autoComplete}
            required={field.required}
          />
        </div>
      ))}

      {mode === "register" && <TermsConsentCheckbox checked={acceptTerms} onChange={setAcceptTerms} />}
      {captcha.widget}

      <button className="btn-primary w-full" disabled={loading} type="submit">
        {loading ? t(`${mode}.submitting`) : t(`${mode}.submit`)}
      </button>

      <p className="text-sm text-slate-600">
        {mode === "login" ? t("login.noAccount") : t("register.haveAccount")}{" "}
        <Link href={mode === "login" ? "/register" : "/login"} className="font-medium underline">
          {mode === "login" ? t("login.registerLink") : t("register.loginLink")}
        </Link>
      </p>

      {error && <p className="text-sm text-red-700">{error}</p>}
    </form>
  );
}

/**
 * Pagina dopo l'accesso: il cambio password obbligato dopo un reset da admin (T-1704), poi l'accettazione dei termini
 * correnti (T-1405), altrimenti la pagina richiesta.
 */
function nextPageAfterLogin(payload: CredentialsResponse | null, redirectPath: string): string {
  if (payload?.code === "PASSWORD_CHANGE_REQUIRED" && payload.redirect) {
    return payload.redirect;
  }
  return payload?.requiresTermsAcceptance ? `/accept-terms?next=${encodeURIComponent(redirectPath)}` : redirectPath;
}
