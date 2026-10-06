"use client";

import Link from "next/link";
import { useTranslations } from "next-intl";
import { FormEvent, useMemo, useState } from "react";
import { safeNextPath } from "@/lib/auth/safe-next-path";
import { postCredentials } from "@/lib/client/auth";
import { useLeavingAction } from "@/lib/client/use-leaving-action";

export function RegisterForm({ nextPath }: { nextPath: string }) {
  const t = useTranslations("auth");
  const redirectPath = useMemo(() => safeNextPath(nextPath), [nextPath]);

  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const { pending, error, run } = useLeavingAction();
  const loading = pending !== null;

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    void run(async (tErrors) => {
      await postCredentials("/api/auth/register", { username, password, confirmPassword }, tErrors);
      window.location.assign(redirectPath);
    });
  };

  return (
    <form className="space-y-4" onSubmit={submit}>
      <div>
        <label className="label" htmlFor="username">
          {t("username")}
        </label>
        <input
          id="username"
          className="input"
          value={username}
          onChange={(event) => setUsername(event.target.value)}
          autoComplete="username"
          required
        />
      </div>

      <div>
        <label className="label" htmlFor="password">
          {t("password")}
        </label>
        <input
          id="password"
          className="input"
          type="password"
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          autoComplete="new-password"
          required
        />
      </div>

      <div>
        <label className="label" htmlFor="confirmPassword">
          {t("confirmPassword")}
        </label>
        <input
          id="confirmPassword"
          className="input"
          type="password"
          value={confirmPassword}
          onChange={(event) => setConfirmPassword(event.target.value)}
          autoComplete="new-password"
          required
        />
      </div>

      <button className="btn-primary w-full" disabled={loading} type="submit">
        {loading ? t("register.submitting") : t("register.submit")}
      </button>

      <p className="text-sm text-slate-600">
        {t("register.haveAccount")}{" "}
        <Link href="/login" className="font-medium underline">
          {t("register.loginLink")}
        </Link>
      </p>

      {error && <p className="text-sm text-red-700">{error}</p>}
    </form>
  );
}
