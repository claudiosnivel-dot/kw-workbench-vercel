"use client";

import { useTranslations } from "next-intl";
import { type FormEvent, useId, useState } from "react";
import { LocaleCodeOptions } from "@/components/locale-code-options";
import { readApiData, sendJson } from "@/lib/client/http";
import { useLocaleOptions } from "@/lib/client/use-locale-options";
import { useOpenTopic } from "@/lib/client/use-open-topic";

type QuickStartFormProps = {
  /** first: primo accesso a tutta pagina con gli esempi; compact: in cima alla home di chi ha già progetti. */
  variant: "first" | "compact";
  /** Lingua e paese predefiniti (resolveDefaultTargeting): l'utente li cambia con «cambia». */
  targeting: { languageCode: string; countryCode: string };
};

type QuickStartData = { projectId: string; topicId: string; extraction: string };

// Limite del topic: è la parola di partenza del primo argomento (D-24).
const TOPIC_MAX_LENGTH = 200;
const EXAMPLES = ["one", "two", "three"] as const;

/**
 * Avvio rapido della home (T-2305): un campo, lingua e paese già scelti e modificabili, esempi cliccabili al primo
 * accesso. L'invio chiama POST /api/projects/quick-start (T-2301) e porta ai risultati dell'argomento creato; se la
 * ricerca non è partita, i risultati mostrano il messaggio del code. Nella home con progetti il pulsante è secondario:
 * il primario resta al prossimo passo del primo progetto (D-39).
 */
export function QuickStartForm({ variant, targeting }: QuickStartFormProps) {
  const t = useTranslations("dashboard.quickStart");
  const tErrors = useTranslations("errors");
  const tCommon = useTranslations("common");
  const openTopic = useOpenTopic();
  const titleId = useId();
  const fieldId = useId();
  const { languageOptions, countryOptions } = useLocaleOptions();
  const [topic, setTopic] = useState("");
  const [languageCode, setLanguageCode] = useState(targeting.languageCode);
  const [countryCode, setCountryCode] = useState(targeting.countryCode);
  const [changing, setChanging] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const first = variant === "first";
  const labelOf = (options: { code: string; label: string }[], code: string) => options.find((option) => option.code === code)?.label ?? code;

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!topic.trim()) {
      setError(t("required"));
      return;
    }

    setPending(true);
    setError(null);
    const response = await sendJson("POST", "/api/projects/quick-start", { topic, languageCode, countryCode }).catch(() => null);
    const result = response ? await readApiData<QuickStartData>(response, tErrors) : { error: tCommon("unexpectedError") };
    if ("error" in result) {
      setError(result.error);
      setPending(false);
      return;
    }
    // Progetto e argomento esistono anche se la ricerca non è partita: i risultati ne mostrano il motivo.
    const { projectId, topicId, extraction } = result.data;
    openTopic(projectId, topicId, extraction === "started" ? null : extraction);
  };

  return (
    <form onSubmit={submit} noValidate className={first ? "mx-auto max-w-2xl space-y-4 text-center" : "space-y-2"}>
      {first ? (
        <>
          <h1 id={titleId} className="text-3xl font-semibold leading-tight">
            {t("title")}
          </h1>
          <p className="text-sm text-slate-600 sm:text-base">{t("intro")}</p>
        </>
      ) : (
        <label htmlFor={fieldId} className="label">
          {t("compactLabel")}
        </label>
      )}

      <div className="flex flex-col gap-2 sm:flex-row">
        <input
          id={fieldId}
          className="input"
          value={topic}
          maxLength={TOPIC_MAX_LENGTH}
          placeholder={t("placeholder")}
          aria-labelledby={first ? titleId : undefined}
          onChange={(event) => setTopic(event.target.value)}
        />
        <button type="submit" className={`${first ? "btn-primary" : "btn-secondary"} shrink-0`} disabled={pending}>
          {pending ? t("submitting") : t("submit")}
        </button>
      </div>
      {error && (
        <p className="text-sm text-red-700" role="alert">
          {error}
        </p>
      )}

      <p className="text-xs text-slate-500">
        {t("targeting", { language: labelOf(languageOptions, languageCode), country: labelOf(countryOptions, countryCode) })}{" "}
        <button
          type="button"
          className="font-medium text-emerald-700 underline underline-offset-2"
          aria-expanded={changing}
          onClick={() => setChanging((current) => !current)}
        >
          {t("change")}
        </button>
      </p>
      {changing && (
        <div className="grid gap-2 text-left sm:grid-cols-2">
          <label className="block">
            <span className="label">{t("languageLabel")}</span>
            <select className="select" value={languageCode} onChange={(event) => setLanguageCode(event.target.value)}>
              <LocaleCodeOptions kind="language" current={languageCode} />
            </select>
          </label>
          <label className="block">
            <span className="label">{t("countryLabel")}</span>
            <select className="select" value={countryCode} onChange={(event) => setCountryCode(event.target.value)}>
              <LocaleCodeOptions kind="country" current={countryCode} />
            </select>
          </label>
        </div>
      )}

      {first && (
        <div className="space-y-2">
          <p className="text-xs text-slate-500">{t("examplesLabel")}</p>
          <div className="flex flex-wrap justify-center gap-2">
            {EXAMPLES.map((key) => (
              <button key={key} type="button" className="status-chip" onClick={() => setTopic(t(`examples.${key}`))}>
                {t(`examples.${key}`)}
              </button>
            ))}
          </div>
        </div>
      )}
    </form>
  );
}
