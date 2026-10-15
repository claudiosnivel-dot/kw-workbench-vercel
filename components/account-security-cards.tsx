"use client";

import { useTranslations } from "next-intl";
import { useState } from "react";
import { SettingsCard } from "@/components/settings-card";
import { patchAuthConfig } from "@/lib/client/auth";
import { useRefreshAction } from "@/lib/client/use-refresh-action";
import { useSaveAction } from "@/lib/client/use-save-action";

// Moduli della sezione Accesso dell'account (T-2802): password e uscita da tutti i dispositivi.

const EMPTY = { currentPassword: "", newPassword: "", confirmPassword: "" };

type PasswordField = keyof typeof EMPTY;

/** Etichetta del catalogo e autocompletamento del browser per ogni campo. */
const FIELDS: { name: PasswordField; label: "current" | "new" | "confirm"; autoComplete: string }[] = [
  { name: "currentPassword", label: "current", autoComplete: "current-password" },
  { name: "newPassword", label: "new", autoComplete: "new-password" },
  { name: "confirmPassword", label: "confirm", autoComplete: "new-password" },
];

/**
 * Modulo Password (T-2802) della sezione Accesso e del cambio password obbligato (T-1704): chiede sempre la password
 * attuale. Il cambio incrementa session_version (T-501): gli altri dispositivi escono, questo riceve il token nuovo.
 */
export function PasswordCard() {
  const t = useTranslations("account.password");
  const [values, setValues] = useState(EMPTY);
  const { saving, error, success, save } = useSaveAction();

  const changePassword = () =>
    save(async (tErrors) => {
      await patchAuthConfig(values, tErrors);
      setValues(EMPTY);
      return t("saved");
    });

  return (
    <SettingsCard
      title={t("title")}
      intro={t("intro")}
      error={error}
      success={success}
      save={{ onClick: changePassword, pending: saving, label: t("save"), pendingLabel: t("saving") }}
    >
      <div className="grid gap-3 md:grid-cols-3">
        {FIELDS.map((field) => (
          <div key={field.name}>
            <label className="label" htmlFor={field.name}>
              {t(field.label)}
            </label>
            <input
              id={field.name}
              type="password"
              className="input"
              value={values[field.name]}
              onChange={(event) => setValues((current) => ({ ...current, [field.name]: event.target.value }))}
              autoComplete={field.autoComplete}
            />
          </div>
        ))}
      </div>
    </SettingsCard>
  );
}

/** «Esci da tutti i dispositivi» della sezione Accesso (T-2802): revoca ogni token dell'utente, compreso questo (T-501). */
export function LogoutEverywhereCard() {
  const t = useTranslations("account.devices");
  const tLogout = useTranslations("auth.logout");
  const { loading, error, run } = useRefreshAction();

  const logoutEverywhere = () =>
    run(() => fetch("/api/auth/logout-all", { method: "POST" }), { redirectTo: "/login", keepLoadingOnSuccess: true });

  return (
    <SettingsCard title={t("title")} intro={t("intro")} error={error}>
      <button className="btn-secondary w-full sm:w-auto" type="button" onClick={logoutEverywhere} disabled={loading}>
        {loading ? tLogout("submitting") : t("action")}
      </button>
    </SettingsCard>
  );
}
