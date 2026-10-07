"use client";

import { useTranslations } from "next-intl";
import { useState } from "react";
import { SettingsCard } from "@/components/settings-card";
import { ApiErrorPayload, readApiResponse, sendJson } from "@/lib/client/http";
import { useRefreshAction } from "@/lib/client/use-refresh-action";
import { useSaveAction } from "@/lib/client/use-save-action";

type AuthSnapshot = {
  email: string | null;
  displayName: string;
};

type AuthSettingsResponse = ApiErrorPayload & {
  data?: { displayName: string };
};

export function AuthSettingsCard({ initial }: { initial: AuthSnapshot }) {
  const t = useTranslations("settings.account");
  const [displayName, setDisplayName] = useState(initial.displayName);
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const { saving, error, success, save } = useSaveAction();

  const saveCredentials = () =>
    save(async (tErrors) => {
      const body = { currentPassword, displayName, newPassword, confirmPassword };
      const payload = await readApiResponse<AuthSettingsResponse>(await sendJson("PATCH", "/api/auth/config", body), tErrors);
      if (payload?.data?.displayName) {
        setDisplayName(payload.data.displayName);
      }
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
      return t("saved");
    });

  return (
    <SettingsCard
      title={t("title")}
      intro={t("intro")}
      error={error}
      success={success}
      save={{ onClick: saveCredentials, pending: saving, label: t("save"), pendingLabel: t("saving") }}
    >

      <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 text-sm">
        <p>
          <span className="font-medium">{t("accountEmail")}</span> {initial.email}
        </p>
        <p>
          <span className="font-medium">{t("activeDisplayName")}</span> {displayName}
        </p>
        <LogoutEverywhereButton />
      </div>

      <div className="grid gap-3 md:grid-cols-2">
        <div>
          <label className="label" htmlFor="authDisplayName">
            {t("newDisplayName")}
          </label>
          <input
            id="authDisplayName"
            className="input"
            value={displayName}
            onChange={(event) => setDisplayName(event.target.value)}
            placeholder={t("displayNamePlaceholder")}
            maxLength={60}
          />
        </div>

        <div>
          <label className="label" htmlFor="currentPassword">
            {t("currentPassword")}
          </label>
          <input
            id="currentPassword"
            type="password"
            className="input"
            value={currentPassword}
            onChange={(event) => setCurrentPassword(event.target.value)}
            placeholder={t("currentPasswordPlaceholder")}
          />
        </div>

        <div>
          <label className="label" htmlFor="newPassword">
            {t("newPassword")}
          </label>
          <input
            id="newPassword"
            type="password"
            className="input"
            value={newPassword}
            onChange={(event) => setNewPassword(event.target.value)}
            placeholder={t("newPasswordPlaceholder")}
          />
        </div>

        <div>
          <label className="label" htmlFor="confirmPassword">
            {t("confirmPassword")}
          </label>
          <input
            id="confirmPassword"
            type="password"
            className="input"
            value={confirmPassword}
            onChange={(event) => setConfirmPassword(event.target.value)}
            placeholder={t("confirmPassword")}
          />
        </div>
      </div>
    </SettingsCard>
  );
}

/** «Esci da tutti i dispositivi»: revoca ogni token dell'utente (session_version + 1), compreso questo. */
function LogoutEverywhereButton() {
  const t = useTranslations("settings.account");
  const tLogout = useTranslations("auth.logout");
  const { loading: pending, error: failure, run } = useRefreshAction();

  const logoutEverywhere = () =>
    run(() => fetch("/api/auth/logout-all", { method: "POST" }), { redirectTo: "/login", keepLoadingOnSuccess: true });

  return (
    <div className="mt-3 border-t border-slate-200 pt-3">
      <p className="text-slate-600">{t("logoutEverywhereHint")}</p>
      <button className="btn btn-secondary mt-2" type="button" onClick={logoutEverywhere} disabled={pending}>
        {pending ? tLogout("submitting") : t("logoutEverywhere")}
      </button>
      {failure && <p className="mt-2 text-red-700">{failure}</p>}
    </div>
  );
}
