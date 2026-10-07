"use client";

import Link from "next/link";
import { useTranslations } from "next-intl";
import { FormEvent } from "react";
import { postCredentials } from "@/lib/client/auth";
import { useFormValues } from "@/lib/client/use-form-values";
import { useLeavingAction } from "@/lib/client/use-leaving-action";

type CredentialsField = {
  id: "username" | "password" | "confirmPassword";
  type: "text" | "password";
  autoComplete: string;
};

const LOGIN_FIELDS: CredentialsField[] = [
  { id: "username", type: "text", autoComplete: "username" },
  { id: "password", type: "password", autoComplete: "current-password" },
];

const REGISTER_FIELDS: CredentialsField[] = [
  { id: "username", type: "text", autoComplete: "username" },
  { id: "password", type: "password", autoComplete: "new-password" },
  { id: "confirmPassword", type: "password", autoComplete: "new-password" },
];

/**
 * Form di accesso e di registrazione (T-1303): stessi campi, la registrazione aggiunge la conferma della password.
 * Dopo una risposta riuscita apre redirectPath, già ridotto a un percorso della stessa origine dal chiamante (T-303).
 */
export function CredentialsForm({ mode, redirectPath }: { mode: "login" | "register"; redirectPath: string }) {
  const t = useTranslations("auth");
  const { values, update } = useFormValues({ username: "", password: "", confirmPassword: "" });
  const { pending, error, run } = useLeavingAction();
  const loading = pending !== null;
  const fields = mode === "login" ? LOGIN_FIELDS : REGISTER_FIELDS;

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const body = Object.fromEntries(fields.map((field) => [field.id, values[field.id]]));
    void run(async (tErrors) => {
      await postCredentials(`/api/auth/${mode}`, body, tErrors);
      window.location.assign(redirectPath);
    });
  };

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
            required
          />
        </div>
      ))}

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
