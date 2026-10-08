"use client";

import { useTranslations } from "next-intl";
import { type FormEvent, useState } from "react";
import { DangerZoneCard } from "@/components/danger-zone-card";
import { FormFeedback } from "@/components/form-feedback";
import { readApiResponse, sendJson } from "@/lib/client/http";
import { useSaveAction } from "@/lib/client/use-save-action";

/**
 * Diritti sui dati dell'account (T-1804): download dell'export JSON e cancellazione con la password attuale. Dopo la
 * cancellazione la sessione non esiste più: si ricarica / , che porta l'anonimo alla landing.
 */
export function AccountDataCard() {
  const t = useTranslations("account");
  const [password, setPassword] = useState("");
  const { saving, error, success, save } = useSaveAction();

  const onDelete = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!window.confirm(t("delete.confirm"))) {
      return;
    }
    void save(async (tErrors) => {
      await readApiResponse(await sendJson("DELETE", "/api/account", { password }), tErrors);
      window.location.assign("/");
      return t("delete.done");
    });
  };

  return (
    <>
      <section className="card space-y-3">
        <h2 className="text-lg font-semibold">{t("export.title")}</h2>
        <p className="text-sm text-slate-600">{t("export.body")}</p>
        <a href="/api/account/export" download className="btn-secondary inline-flex" data-testid="account-export">
          {t("export.action")}
        </a>
      </section>

      <DangerZoneCard warning={t("delete.warning")}>
        <form className="space-y-3" onSubmit={onDelete}>
          <div>
            <label className="label" htmlFor="delete-password">
              {t("delete.password")}
            </label>
            <input
              id="delete-password"
              className="input"
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              required
            />
          </div>
          <button type="submit" className="btn-danger" disabled={saving}>
            {saving ? t("delete.pending") : t("delete.action")}
          </button>
          <FormFeedback error={error} success={success} />
        </form>
      </DangerZoneCard>
    </>
  );
}
