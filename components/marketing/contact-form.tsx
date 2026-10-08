"use client";

import { useTranslations } from "next-intl";
import { FormFeedback } from "@/components/form-feedback";
import { SubmitButton } from "@/components/submit-button";
import { useTurnstile } from "@/components/turnstile-widget";
import { CONTACT_CATEGORIES } from "@/lib/contact/categories";
import { useFormValues } from "@/lib/client/use-form-values";
import { usePostForm } from "@/lib/client/use-post-form";

/**
 * Modulo contatti (T-1805): nome, email (precompilata per l'utente autenticato), categoria, messaggio e, con la site
 * key, il widget Turnstile con action contact; i limiti di lunghezza li rivalida il server.
 */
export function ContactForm({ initialEmail, turnstileSiteKey }: { initialEmail: string; turnstileSiteKey: string | null }) {
  const t = useTranslations("contact");
  const { values, update } = useFormValues({ name: "", email: initialEmail, category: "support", message: "" });
  const { saving, error, success, submitWith } = usePostForm("/api/contact", t("sent"));
  const captcha = useTurnstile(turnstileSiteKey, "contact");

  return (
    <form className="space-y-4" onSubmit={submitWith(() => captcha.attach(values))}>
      <div>
        <label className="label" htmlFor="contact-name">
          {t("name")}
        </label>
        <input
          id="contact-name"
          className="input"
          autoComplete="name"
          maxLength={100}
          value={values.name}
          onChange={(event) => update("name", event.target.value)}
          required
        />
      </div>
      <div>
        <label className="label" htmlFor="contact-email">
          {t("email")}
        </label>
        <input
          id="contact-email"
          className="input"
          type="email"
          autoComplete="email"
          maxLength={254}
          value={values.email}
          onChange={(event) => update("email", event.target.value)}
          required
        />
      </div>
      <div>
        <label className="label" htmlFor="contact-category">
          {t("category")}
        </label>
        <select
          id="contact-category"
          className="select"
          value={values.category}
          onChange={(event) => update("category", event.target.value)}
        >
          {CONTACT_CATEGORIES.map((category) => (
            <option key={category} value={category}>
              {t(`categories.${category}`)}
            </option>
          ))}
        </select>
      </div>
      <div>
        <label className="label" htmlFor="contact-message">
          {t("message")}
        </label>
        <textarea
          id="contact-message"
          className="input min-h-40"
          minLength={10}
          maxLength={5000}
          value={values.message}
          onChange={(event) => update("message", event.target.value)}
          required
        />
      </div>

      {captcha.widget}
      <SubmitButton pending={saving} label={t("submit")} pendingLabel={t("submitting")} />
      <FormFeedback error={error} success={success} />
    </form>
  );
}
