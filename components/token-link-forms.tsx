"use client";

import { useTranslations } from "next-intl";
import { useEffect, useRef, useState } from "react";
import { FormDone } from "@/components/form-done";
import { FormFeedback } from "@/components/form-feedback";
import { SubmitButton } from "@/components/submit-button";
import { sendJson } from "@/lib/client/http";
import { useFormValues } from "@/lib/client/use-form-values";
import { usePostForm } from "@/lib/client/use-post-form";

// Form delle pagine aperte dai link con token delle email (T-1403, T-1404, T-1503, T-3002), mostrati da TokenLinkCard.

type TokenActionLabels = { success: string; submit: string; submitting: string; goToApp: string };

/**
 * Token del link inviato solo col pulsante, con una POST: aprire la pagina non lo consuma, così gli scanner dei link
 * delle caselle di posta non lo bruciano. Dopo il successo, conferma e link verso l'app.
 */
function TokenActionForm({ url, token, labels }: { url: string; token: string; labels: TokenActionLabels }) {
  const { saving, error, success, post } = usePostForm(url, labels.success);

  if (success) {
    return <FormDone message={success} href="/" linkLabel={labels.goToApp} />;
  }

  return (
    <div className="space-y-4">
      <SubmitButton pending={saving} label={labels.submit} pendingLabel={labels.submitting} onClick={() => void post({ token })} />
      <FormFeedback error={error} />
    </div>
  );
}

/** Conferma dell'email (T-1403). */
export function VerifyEmailForm({ token }: { token: string }) {
  const t = useTranslations("auth.verify");
  const labels = { success: t("success"), submit: t("submit"), submitting: t("submitting"), goToApp: t("goToApp") };
  return <TokenActionForm url="/api/auth/verify-email" token={token} labels={labels} />;
}

const PASSWORD_FIELDS = ["password", "confirmPassword"] as const;

/**
 * Nuova password dal link di recupero (T-1404): nessuna sessione dopo il reset, l'utente accede con la nuova password;
 * ogni sessione aperta in precedenza decade.
 */
export function ResetPasswordForm({ token }: { token: string }) {
  const t = useTranslations("auth.reset");
  const { values, update } = useFormValues({ password: "", confirmPassword: "" });
  const { saving, error, success, submitWith } = usePostForm("/api/auth/password-reset/confirm", t("done"));

  if (success) {
    return <FormDone message={success} href="/login" linkLabel={t("goToLogin")} />;
  }

  return (
    <form className="space-y-4" onSubmit={submitWith(() => ({ token, ...values }))}>
      {PASSWORD_FIELDS.map((field) => (
        <div key={field}>
          <label className="label" htmlFor={field}>
            {t(field)}
          </label>
          <input
            id={field}
            className="input"
            type="password"
            autoComplete="new-password"
            value={values[field]}
            onChange={(event) => update(field, event.target.value)}
            required
          />
        </div>
      ))}

      <SubmitButton pending={saving} label={t("submit")} pendingLabel={t("submitting")} />
      <FormFeedback error={error} />
    </form>
  );
}

type EmailChangeState = "confirming" | "success" | "invalid" | "taken" | "error";

// Esiti di POST /api/auth/email-change/confirm (T-3001); ogni altra risposta è un errore imprevisto.
const EMAIL_CHANGE_OUTCOMES: Record<number, EmailChangeState> = { 200: "success", 409: "taken", 410: "invalid" };

/**
 * Conferma del cambio dell'email (T-3002): all'apertura la pagina invia il token alla rotta con una POST, una volta sola,
 * e mostra l'esito; il token non compare nel contenuto. Il link arriva al nuovo indirizzo: aprirlo è la conferma.
 */
export function EmailChangeConfirm({ token }: { token: string }) {
  const t = useTranslations("auth.emailChange");
  const tCommon = useTranslations("common");
  const [state, setState] = useState<EmailChangeState>("confirming");
  const sent = useRef(false);

  useEffect(() => {
    if (sent.current) {
      return;
    }
    sent.current = true;
    sendJson("POST", "/api/auth/email-change/confirm", { token })
      .then((response) => setState(EMAIL_CHANGE_OUTCOMES[response.status] ?? "error"))
      .catch(() => setState("error"));
  }, [token]);

  if (state === "confirming") {
    return (
      <p className="text-sm" role="status">
        {t("confirming")}
      </p>
    );
  }
  if (state === "success") {
    return <FormDone message={t("success")} href="/login" linkLabel={t("goToLogin")} />;
  }
  return (
    <p className="text-sm text-red-700" role="alert">
      {state === "error" ? tCommon("unexpectedError") : t(state)}
    </p>
  );
}

/**
 * Accettazione di un invito in un workspace (T-1503): la rotta controlla che l'email dell'utente della sessione sia
 * quella dell'invito e verificata.
 */
export function AcceptInviteForm({ token }: { token: string }) {
  const t = useTranslations("workspace.accept");
  const labels = { success: t("success"), submit: t("submit"), submitting: t("submitting"), goToApp: t("goToApp") };
  return <TokenActionForm url="/api/invites/accept" token={token} labels={labels} />;
}
