"use client";

import { useTranslations } from "next-intl";
import { useState } from "react";
import { CardIntro } from "@/components/card-intro";
import { ApiErrorPayload, readApiResponse } from "@/lib/client/http";
import { useRefreshAction } from "@/lib/client/use-refresh-action";

type AuthSnapshot = {
  username: string;
};

type AuthSettingsResponse = ApiErrorPayload & {
  data?: AuthSnapshot;
};

export function AuthSettingsCard({ initial }: { initial: AuthSnapshot }) {
  const t = useTranslations("settings.account");
  const tErrors = useTranslations("errors");
  const tCommon = useTranslations("common");
  const [username, setUsername] = useState(initial.username);
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const save = async () => {
    setSaving(true);
    setError(null);
    setSuccess(null);

    try {
      const response = await fetch("/api/auth/config", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          currentPassword,
          username,
          newPassword,
          confirmPassword,
        }),
      });

      const payload = await readApiResponse<AuthSettingsResponse>(response, tErrors);

      if (payload?.data?.username) {
        setUsername(payload.data.username);
      }

      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
      setSuccess(t("saved"));
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : tCommon("unexpectedError"));
    } finally {
      setSaving(false);
    }
  };

  return (
    <section className="card space-y-4">
      <CardIntro title={t("title")} intro={t("intro")} />

      <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 text-sm">
        <p>
          <span className="font-medium">{t("activeUsername")}</span> {username}
        </p>
        <LogoutEverywhereButton />
      </div>

      <div className="grid gap-3 md:grid-cols-2">
        <div>
          <label className="label" htmlFor="authUsername">
            {t("newUsername")}
          </label>
          <input
            id="authUsername"
            className="input"
            value={username}
            onChange={(event) => setUsername(event.target.value)}
            placeholder={t("usernamePlaceholder")}
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

      <button className="btn-primary w-full sm:w-auto" type="button" onClick={save} disabled={saving}>
        {saving ? t("saving") : t("save")}
      </button>

      {error && <p className="text-sm text-red-700">{error}</p>}
      {success && <p className="text-sm text-green-700">{success}</p>}
    </section>
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
