"use client";

import Link from "next/link";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { FormFeedback } from "@/components/form-feedback";
import { SubmitButton } from "@/components/submit-button";
import { useTurnstile } from "@/components/turnstile-widget";
import { usePostForm } from "@/lib/client/use-post-form";

/**
 * Richiesta del link di recupero password (T-1404): la conferma è la stessa per ogni email, registrata o no. Con
 * turnstileSiteKey invia anche il token del CAPTCHA (T-1702), monouso: dopo ogni invio il widget ne chiede uno nuovo.
 */
export function ForgotPasswordForm({ turnstileSiteKey }: { turnstileSiteKey: string | null }) {
  const t = useTranslations("auth.forgot");
  const tAuth = useTranslations("auth");
  const [email, setEmail] = useState("");
  const { saving, error, success, submitWith } = usePostForm("/api/auth/password-reset/request", t("sent"));
  const captcha = useTurnstile(turnstileSiteKey, "password-reset");

  const body = () => {
    const sent = { email, turnstileToken: captcha.token };
    captcha.reset();
    return sent;
  };

  return (
    <form className="space-y-4" onSubmit={submitWith(body)}>
      <div>
        <label className="label" htmlFor="email">
          {tAuth("email")}
        </label>
        <input
          id="email"
          className="input"
          type="email"
          autoComplete="email"
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          required
        />
      </div>

      {captcha.widget}
      <SubmitButton pending={saving} label={t("submit")} pendingLabel={t("submitting")} />
      <FormFeedback error={error} success={success} />

      <p className="text-sm text-slate-600">
        <Link href="/login" className="font-medium underline">
          {t("backToLogin")}
        </Link>
      </p>
    </form>
  );
}
