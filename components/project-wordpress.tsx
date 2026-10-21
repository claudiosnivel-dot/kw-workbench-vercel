"use client";

import { useTranslations } from "next-intl";
import { useState } from "react";
import { CardIntro } from "@/components/card-intro";
import { SettingField } from "@/components/project-advanced-fields";
import { sendJson } from "@/lib/client/http";
import { useApiData } from "@/lib/client/use-api-data";
import { useRefreshAction } from "@/lib/client/use-refresh-action";

/** Collegamento salvato come lo legge la pagina (T-4601): indirizzo e utente, della password solo se è configurata. */
export type WordPressSettings = { siteUrl: string; username: string; configured: boolean };

const FIELDS = [
  { key: "siteUrl", id: "wordpress-site-url", type: "url", max: 300, autoComplete: "url", hint: "siteUrlHint" },
  { key: "username", id: "wordpress-username", type: "text", max: 120, autoComplete: "off" },
  { key: "appPassword", id: "wordpress-app-password", type: "password", max: 40, autoComplete: "new-password" },
] as const;

/**
 * Blocco «WordPress» delle impostazioni del progetto (T-4601): indirizzo del sito, utente e password per le
 * applicazioni salvati con la rotta del collegamento (la password non torna mai: dopo il salvataggio il campo si
 * svuota), «Prova collegamento» con l'esito, «Scollega» e la guida per creare la password in WordPress.
 */
export function ProjectWordPress({ projectId, initial }: { projectId: string; initial: WordPressSettings }) {
  const t = useTranslations("projects.wordpress");
  const [values, setValues] = useState({ siteUrl: initial.siteUrl, username: initial.username, appPassword: "" });
  const [saved, setSaved] = useState(false);
  const check = useApiData<{ name: string; canEditPosts: boolean }>();
  const { loading, error, run } = useRefreshAction();
  const endpoint = `/api/projects/${projectId}/wordpress`;

  const reset = () => {
    setSaved(false);
    check.clear();
  };

  const save = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    reset();
    if (!(await run(() => sendJson("PUT", endpoint, values)))) {
      setValues((current) => ({ ...current, appPassword: "" }));
      setSaved(true);
    }
  };

  const test = () => {
    reset();
    void check.load(() => fetch(`${endpoint}/test`, { method: "POST" }));
  };

  const disconnect = async () => {
    reset();
    if (!(await run(() => fetch(endpoint, { method: "DELETE" })))) setValues({ siteUrl: "", username: "", appPassword: "" });
  };

  const failure = error ?? check.error;

  return (
    <section className="card space-y-4">
      <CardIntro title={t("title")} intro={t("intro")} />
      <form className="space-y-4" onSubmit={save}>
        <div className="grid gap-4 md:grid-cols-3">
          {FIELDS.map((field) => (
            <SettingField
              key={field.key}
              id={field.id}
              label={t(field.key)}
              hint={"hint" in field ? t(field.hint) : field.key === "appPassword" && initial.configured ? t("appPasswordSaved") : undefined}
            >
              <input
                id={field.id}
                className="input"
                type={field.type}
                value={values[field.key]}
                maxLength={field.max}
                autoComplete={field.autoComplete}
                required
                onChange={(event) => setValues((current) => ({ ...current, [field.key]: event.target.value }))}
              />
            </SettingField>
          ))}
        </div>
        <div className="flex flex-wrap gap-2">
          <button type="submit" className="btn-secondary" disabled={loading}>
            {loading ? t("saving") : t("save")}
          </button>
          {initial.configured && (
            <>
              <button type="button" className="btn-secondary" disabled={loading || check.loading} onClick={test}>
                {check.loading ? t("testing") : t("test")}
              </button>
              <button type="button" className="btn-secondary" disabled={loading} onClick={() => void disconnect()}>
                {t("disconnect")}
              </button>
            </>
          )}
        </div>
      </form>
      <div role="status" className="space-y-1 text-sm">
        {saved && <p className="text-slate-600">{t("saved")}</p>}
        {check.data && <p className="text-slate-700">{t("testOk", { name: check.data.name })}</p>}
        {check.data && !check.data.canEditPosts && <p className="text-amber-800">{t("testNoEditPosts")}</p>}
      </div>
      {failure && (
        <p className="text-sm text-red-700" role="alert">
          {failure}
        </p>
      )}
      <details className="text-sm text-slate-600">
        <summary className="cursor-pointer font-medium text-slate-700">{t("guide.title")}</summary>
        <ol className="mt-2 list-decimal space-y-1 pl-5">
          <li>{t("guide.step1")}</li>
          <li>{t("guide.step2")}</li>
          <li>{t("guide.step3")}</li>
        </ol>
        <p className="mt-2">{t("guide.structuredData")}</p>
      </details>
    </section>
  );
}
