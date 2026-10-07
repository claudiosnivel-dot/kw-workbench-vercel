"use client";

import { useTranslations } from "next-intl";
import { FormDone } from "@/components/form-done";
import { FormFeedback } from "@/components/form-feedback";
import { SubmitButton } from "@/components/submit-button";
import { useFormValues } from "@/lib/client/use-form-values";
import { usePostForm } from "@/lib/client/use-post-form";

// Form delle pagine aperte dai link con token delle email (T-1403, T-1404), mostrati da TokenLinkCard.

/**
 * Conferma dell'email (T-1403): il token del link si invia solo col pulsante, con una POST; aprire la pagina non lo
 * consuma, così gli scanner dei link delle caselle di posta non lo bruciano.
 */
export function VerifyEmailForm({ token }: { token: string }) {
  const t = useTranslations("auth.verify");
  const { saving, error, success, post } = usePostForm("/api/auth/verify-email", t("success"));

  if (success) {
    return <FormDone message={success} href="/" linkLabel={t("goToApp")} />;
  }

  return (
    <div className="space-y-4">
      <SubmitButton pending={saving} label={t("submit")} pendingLabel={t("submitting")} onClick={() => void post({ token })} />
      <FormFeedback error={error} />
    </div>
  );
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
